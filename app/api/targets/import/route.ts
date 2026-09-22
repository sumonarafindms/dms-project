import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { apiUser, apiPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { monthBounds } from "@/lib/month";
import { audit } from "@/lib/audit";
import { phoneKey } from "@/lib/phone";
import { validateUploadFile, validateUploadContent, assertRowLimit } from "@/lib/upload-safety";
import { RATE_LIMITS, consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const text = (v: unknown) => String(v ?? "").trim();
const strictNum = (v: unknown) => {
  const raw = text(v).replace(/,/g, "");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const int = (v: number) => Math.max(0, Math.trunc(v));
const head = (v: unknown) => text(v).toUpperCase().replace(/\s+/g, "_");
type TargetState = {
  gaTarget: number;
  c2cTarget: number;
  scTarget: number;
  totalRechargeTarget: number;
  ssoTarget: number;
  lsoTarget: number;
  explicitRecharge: boolean;
};

export async function POST(req: Request) {
  const actor = await apiUser(["ADMIN", "IT"]);
  if (actor) {
    const limit = await consumeRateLimit(RATE_LIMITS.upload, actor.id);
    if (!limit.allowed) {
      const r = rateLimitResponse(limit.retryAfterSeconds);
      return NextResponse.json(r.body, r.init);
    }
  }
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await apiPermission("targets", "update")))
    return NextResponse.json({ error: "You do not have permission to update targets." }, { status: 403 });
  try {
    const form = await req.formData(),
      file = form.get("file"),
      monthText = text(form.get("month"));
    if (!(file instanceof File)) return NextResponse.json({ error: "Target Excel file is required." }, { status: 400 });
    const fileError = validateUploadFile(file, [".xlsx", ".xls", ".xlsm"]);
    if (fileError) return NextResponse.json({ error: fileError }, { status: 400 });
    if (!/^\d{4}-\d{2}$/.test(monthText))
      return NextResponse.json({ error: "Select the target month first." }, { status: 400 });
    const { start: month, end: monthEnd } = monthBounds(`${monthText}-01T00:00:00.000Z`);
    const bytes = Buffer.from(await file.arrayBuffer());
    const contentError = validateUploadContent(file.name, bytes);
    if (contentError) return NextResponse.json({ error: contentError }, { status: 400 });
    const wb = XLSX.read(bytes, { type: "buffer", cellDates: true }),
      ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) return NextResponse.json({ error: "Target workbook has no worksheet." }, { status: 400 });
    const matrix = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: false, defval: "" });
    assertRowLimit(matrix.length, "target sheet");
    if (!matrix.length) return NextResponse.json({ error: "Target file is empty." }, { status: 400 });
    const headers = (matrix[0] || []).map(head),
      rows = matrix.slice(1).filter((r) => r.some((v: any) => text(v))),
      idx = (name: string) => headers.indexOf(name);
    /*
     * Two sheet shapes, told apart by their headings.
     *
     * WIDE (what /api/samples/targets now hands out): one row per person.
     *
     *     CODE | GA | C2C | SC | SSO | LSO
     *
     * CODE is an RSO's mobile number, or a retailer code for a Business
     * Partner. One column rather than two, because a row is one or the other;
     * the importer tells them apart by looking the value up and reports which
     * it matched. This is the shape a spreadsheet is already in when someone
     * copies a block of numbers out of one, which is the whole point.
     *
     * LONG (the previous sheet): one row per target.
     *
     *     RSO_NUMBER | BP_CODE | TARGET_TYPE | TARGET
     *
     * Still accepted, because a file that used to import must not start
     * failing. Six numbers for one RSO took six rows here, and forty RSOs took
     * two hundred and forty.
     */
    const iCode = idx("CODE"),
      iType = idx("TARGET_TYPE"),
      iRso = idx("RSO_NUMBER"),
      iBp = idx("BP_CODE"),
      iTarget = idx("TARGET");
    const wide = iType < 0;
    const WIDE_METRICS = [
      { head: "GA", key: "gaTarget" as const, integer: true },
      { head: "C2C", key: "c2cTarget" as const, integer: false },
      { head: "SC", key: "scTarget" as const, integer: false },
      { head: "SSO", key: "ssoTarget" as const, integer: true },
      { head: "LSO", key: "lsoTarget" as const, integer: true },
    ];
    const wideCols = WIDE_METRICS.map((m) => ({ ...m, at: idx(m.head) }));

    if (wide) {
      const missing: string[] = [];
      if (iCode < 0) missing.push("CODE");
      if (!wideCols.some((c) => c.at >= 0)) missing.push("at least one of GA, C2C, SC, SSO, LSO");
      if (missing.length)
        return NextResponse.json(
          {
            error: `Required heading${missing.length > 1 ? "s" : ""} missing: ${missing.join(", ")}. Found headings: ${headers.filter(Boolean).join(", ") || "none"}. Download the sample for the expected layout.`,
          },
          { status: 400 },
        );
    } else {
      const missing: string[] = [];
      if (iRso < 0 && iBp < 0) missing.push("RSO_NUMBER or BP_CODE");
      if (iTarget < 0) missing.push("TARGET");
      if (missing.length)
        return NextResponse.json(
          {
            error: `Required heading${missing.length > 1 ? "s" : ""} missing: ${missing.join(", ")}. Found headings: ${headers.filter(Boolean).join(", ") || "none"}.`,
          },
          { status: 400 },
        );
    }

    const [employees, existingTargets, bpAssignments] = await Promise.all([
      prisma.employee.findMany({ where: { active: true }, select: { id: true, rsoMsisdn: true, employeeCode: true } }),
      prisma.monthlyTarget.findMany({ where: { month } }),
      prisma.bpAssignment.findMany({
        where: { active: true, startDate: { lt: monthEnd }, OR: [{ endDate: null }, { endDate: { gte: month } }] },
        include: { retailer: { select: { retailerCode: true } } },
        orderBy: { startDate: "desc" },
      }),
    ]);
    const employeeByKey = new Map<string, string>();
    for (const e of employees) {
      employeeByKey.set(phoneKey(e.rsoMsisdn), e.id);
      if (e.employeeCode) employeeByKey.set(e.employeeCode.trim().toUpperCase(), e.id);
    }
    const targetByEmployee = new Map<string, TargetState>(
      existingTargets.map((x) => [
        x.employeeId,
        {
          gaTarget: x.gaTarget,
          c2cTarget: Number(x.c2cTarget),
          scTarget: Number(x.scTarget),
          totalRechargeTarget: Number(x.totalRechargeTarget),
          ssoTarget: x.ssoTarget,
          lsoTarget: x.lsoTarget,
          explicitRecharge: false,
        },
      ]),
    );
    /*
     * EVERY active assignment of a code, not the first one.
     *
     * A retailer can be a Business Partner under several RSOs at once, and a
     * target file names the outlet, not the assignment — so one row sets the
     * same GA target for each RSO holding it, which is what the owner asked
     * for. Keeping only the first match would have set one and silently left
     * the others at whatever they were.
     */
    type BpAssignmentRow = (typeof bpAssignments)[number];
    const bpByCode = new Map<string, BpAssignmentRow[]>();
    for (const a of bpAssignments) {
      const code = a.retailer.retailerCode.trim().toUpperCase();
      bpByCode.set(code, [...(bpByCode.get(code) ?? []), a]);
    }

    const blankState = (): TargetState => ({
      gaTarget: 0,
      c2cTarget: 0,
      scTarget: 0,
      totalRechargeTarget: 0,
      ssoTarget: 0,
      lsoTarget: 0,
      explicitRecharge: false,
    });

    const touched = new Set<string>(),
      bpTargets = new Map<string, number>(),
      errors: string[] = [],
      /** Values a BP row carried that this system has nowhere to put. */
      ignored: string[] = [];
    let validRows = 0,
      rsoRows = 0,
      bpRows = 0;

    for (let n = 0; n < rows.length; n++) {
      const row = rows[n];
      try {
        if (wide) {
          const code = text(row[iCode]);
          if (!code) throw new Error("CODE is required.");
          const employeeId = employeeByKey.get(phoneKey(code)) || employeeByKey.get(code.trim().toUpperCase());
          const assignments = bpByCode.get(code.trim().toUpperCase());
          if (employeeId && assignments?.length)
            throw new Error(`${code} matches both an RSO and a BP retailer code. Rename one of them.`);
          if (!employeeId && !assignments?.length)
            throw new Error(`${code} is not an RSO mobile number or a BP retailer code active in ${monthText}.`);

          const value = (at: number) => (at < 0 ? null : strictNum(row[at]));

          if (assignments?.length) {
            // A BP has a GA target and nothing else in this schema.
            const ga = value(wideCols[0].at);
            if (ga === null) throw new Error("GA must be a valid non-negative number.");
            for (const a of assignments) bpTargets.set(a.id, int(ga));
            const spare = wideCols
              .slice(1)
              .filter((c) => (value(c.at) ?? 0) > 0)
              .map((c) => c.head);
            if (spare.length && ignored.length < 30)
              ignored.push(`Row ${n + 2}: ${code} is a BP — ${spare.join(", ")} ignored (BPs carry a GA target only).`);
            bpRows++;
            validRows++;
            continue;
          }

          const state = targetByEmployee.get(employeeId!) || blankState();
          for (const c of wideCols) {
            if (c.at < 0) continue;
            const v = value(c.at);
            if (v === null) {
              // A blank cell leaves the stored target alone; a bad one is an
              // error, because "0" and "abc" must not mean the same thing.
              if (text(row[c.at])) throw new Error(`${c.head} must be a valid non-negative number.`);
              continue;
            }
            state[c.key] = c.integer ? int(v) : v;
          }
          targetByEmployee.set(employeeId!, state);
          touched.add(employeeId!);
          rsoRows++;
          validRows++;
          continue;
        }

        const rso = iRso >= 0 ? text(row[iRso]) : "",
          bp = iBp >= 0 ? text(row[iBp]).toUpperCase() : "",
          type = text(row[iType]).toUpperCase(),
          value = strictNum(row[iTarget]);
        if (value === null) throw new Error("TARGET must be a valid non-negative number.");
        if (bp) {
          if (!["BP_GA", "GA"].includes(type)) throw new Error("BP_CODE supports TARGET_TYPE BP_GA or GA.");
          const assignments = bpByCode.get(bp);
          if (!assignments?.length) throw new Error(`No BP assignment found for ${bp} in ${monthText}.`);
          for (const a of assignments) bpTargets.set(a.id, int(value));
          validRows++;
          continue;
        }
        if (!rso) throw new Error("RSO_NUMBER or BP_CODE is required.");
        const employeeId = employeeByKey.get(phoneKey(rso)) || employeeByKey.get(rso.trim().toUpperCase());
        if (!employeeId) throw new Error(`RSO ${rso} not found.`);
        const state = targetByEmployee.get(employeeId) || blankState();
        if (type === "GA") state.gaTarget = int(value);
        else if (type === "C2C") state.c2cTarget = value;
        else if (type === "SC") state.scTarget = value;
        else if (["TOTAL_RECHARGE", "RECHARGE"].includes(type)) {
          state.totalRechargeTarget = value;
          state.explicitRecharge = true;
        } else if (type === "SSO") state.ssoTarget = int(value);
        else if (type === "LSO") state.lsoTarget = int(value);
        else throw new Error(`Unsupported TARGET_TYPE ${type}.`);
        targetByEmployee.set(employeeId, state);
        touched.add(employeeId);
        validRows++;
      } catch (e) {
        if (errors.length < 30) errors.push(`Row ${n + 2}: ${e instanceof Error ? e.message : "Invalid row"}`);
      }
    }

    if (errors.length) {
      return NextResponse.json(
        {
          error: `Target data validation failed: ${errors.length} invalid row(s). ${errors.slice(0, 8).join("; ")}${errors.length > 8 ? " …" : ""}`,
          errors,
          totalRows: rows.length,
          validRows,
          failed: errors.length,
        },
        { status: 400 },
      );
    }
    for (const employeeId of touched) {
      const s = targetByEmployee.get(employeeId)!;
      if (!s.explicitRecharge) s.totalRechargeTarget = s.c2cTarget + s.scTarget;
    }

    await prisma.$transaction(async (tx) => {
      for (const employeeId of touched) {
        const s = targetByEmployee.get(employeeId)!;
        const data = {
          gaTarget: s.gaTarget,
          c2cTarget: s.c2cTarget,
          scTarget: s.scTarget,
          totalRechargeTarget: s.totalRechargeTarget,
          ssoTarget: s.ssoTarget,
          lsoTarget: s.lsoTarget,
        };
        await tx.monthlyTarget.upsert({
          where: { employeeId_month: { employeeId, month } },
          update: data,
          create: { employeeId, month, ...data },
        });
      }
      for (const [assignmentId, gaTarget] of bpTargets)
        await tx.bpMonthlyTarget.upsert({
          where: { assignmentId_month: { assignmentId, month } },
          update: { gaTarget },
          create: { assignmentId, month, gaTarget },
        });
    });

    const updated = touched.size + bpTargets.size,
      failed = rows.length - validRows;
    await audit(actor, "IMPORT_TARGETS", "targets", {
      targetType: "File",
      targetName: file.name,
      detail: `Imported ${updated} target record(s) for ${monthText}`,
      metadata: { month: monthText, updated, failed, validRows, layout: wide ? "wide" : "long", rsoRows, bpRows },
    });
    return NextResponse.json({
      ok: true,
      month: monthText,
      layout: wide ? "wide" : "long",
      totalRows: rows.length,
      validRows,
      rsoRows,
      // Assignments written, which is more than the number of BP rows when a
      // code is held by several RSOs — the caller should see both.
      bpRows,
      bpAssignmentsUpdated: bpTargets.size,
      updated,
      failed,
      errors,
      // Values the sheet carried that this system cannot store. Reported
      // rather than dropped: a number typed into a cell and silently discarded
      // is the failure mode this project keeps auditing for.
      ignored,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Target import failed" }, { status: 400 });
  }
}
