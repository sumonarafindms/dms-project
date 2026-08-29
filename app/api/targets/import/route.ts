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
  const actor = await apiUser(["ADMIN", "IT", "ACCOUNTS"]);
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
    const iRso = idx("RSO_NUMBER"),
      iBp = idx("BP_CODE"),
      iType = idx("TARGET_TYPE"),
      iTarget = idx("TARGET");
    const missing: string[] = [];
    if (iRso < 0 && iBp < 0) missing.push("RSO_NUMBER or BP_CODE");
    if (iType < 0) missing.push("TARGET_TYPE");
    if (iTarget < 0) missing.push("TARGET");
    if (missing.length)
      return NextResponse.json(
        {
          error: `Required heading${missing.length > 1 ? "s" : ""} missing: ${missing.join(", ")}. Found headings: ${headers.filter(Boolean).join(", ") || "none"}.`,
        },
        { status: 400 },
      );

    const [employees, existingTargets, bpAssignments] = await Promise.all([
      prisma.employee.findMany({ where: { active: true }, select: { id: true, rsoMsisdn: true, employeeCode: true } }),
      prisma.monthlyTarget.findMany({ where: { month } }),
      prisma.bpAssignment.findMany({
        where: { startDate: { lt: monthEnd }, OR: [{ endDate: null }, { endDate: { gte: month } }] },
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
    type BpAssignmentRow = (typeof bpAssignments)[number];
    const bpByCode = new Map<string, BpAssignmentRow>();
    for (const a of bpAssignments) {
      const code = a.retailer.retailerCode.trim().toUpperCase();
      if (!bpByCode.has(code)) bpByCode.set(code, a);
    }

    const touched = new Set<string>(),
      bpTargets = new Map<string, number>(),
      errors: string[] = [];
    let validRows = 0;
    for (let n = 0; n < rows.length; n++) {
      const row = rows[n],
        rso = iRso >= 0 ? text(row[iRso]) : "",
        bp = iBp >= 0 ? text(row[iBp]).toUpperCase() : "",
        type = text(row[iType]).toUpperCase(),
        value = strictNum(row[iTarget]);
      try {
        if (value === null) throw new Error("TARGET must be a valid non-negative number.");
        if (bp) {
          if (!["BP_GA", "GA"].includes(type)) throw new Error("BP_CODE supports TARGET_TYPE BP_GA or GA.");
          const assignment = bpByCode.get(bp);
          if (!assignment) throw new Error(`No BP assignment found for ${bp} in ${monthText}.`);
          bpTargets.set(assignment.id, int(value));
          validRows++;
          continue;
        }
        if (!rso) throw new Error("RSO_NUMBER or BP_CODE is required.");
        const employeeId = employeeByKey.get(phoneKey(rso)) || employeeByKey.get(rso.trim().toUpperCase());
        if (!employeeId) throw new Error(`RSO ${rso} not found.`);
        const state = targetByEmployee.get(employeeId) || {
          gaTarget: 0,
          c2cTarget: 0,
          scTarget: 0,
          totalRechargeTarget: 0,
          ssoTarget: 0,
          lsoTarget: 0,
          explicitRecharge: false,
        };
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
      metadata: { month: monthText, updated, failed, validRows },
    });
    return NextResponse.json({
      ok: true,
      month: monthText,
      totalRows: rows.length,
      validRows,
      updated,
      failed,
      errors,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Target import failed" }, { status: 400 });
  }
}
