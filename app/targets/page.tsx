"use client";

/**
 * Monthly target control — migrated to the role-UI kit.
 *
 * Two editable grids (RSO targets, BP GA targets) plus a bulk importer, all
 * for one month. Nothing is written until "Save all changes": the inputs edit
 * local state so an operator can work down a column without a request per
 * keystroke, which is also why the save bar reports how many records are in
 * play.
 *
 * Each grid is rendered twice — a table from 640px, one card per record below
 * it. The editable cells make a horizontally scrolling table unusable on a
 * phone, so this is the one place in the app where the card fallback is worth
 * its duplication.
 */

import { useEffect, useMemo, useState } from "react";
import { useCan } from "../components/PermissionContext";
import { dhakaMonth } from "../../lib/business-time";
import { Card, DropZone, EmptyState, Field, PageHeader, SectionHead, SummaryStrip } from "../components/Kit";
import { Icon } from "../components/icons";

type TargetRow = {
  employeeId: string;
  employeeCode: string | null;
  rsoMsisdn: string;
  name: string;
  supervisor: string;
  retailerCount: number;
  gaTarget: number;
  c2cTarget: number;
  scTarget: number;
  totalRechargeTarget: number;
  ssoTarget: number;
  lsoTarget: number;
  scAchieved: number;
};
type BpRow = {
  assignmentId: string;
  bpCode: string;
  bpName: string;
  rsoName: string;
  rsoMsisdn: string;
  gaTarget: number;
};
type ImportResult = { totalRows?: number; updated?: number; failed?: number; errors?: string[] };

const numericFields = [
  "gaTarget",
  "c2cTarget",
  "scTarget",
  "totalRechargeTarget",
  "ssoTarget",
  "lsoTarget",
  "scAchieved",
] as const;
type NumericField = (typeof numericFields)[number];

const FIELD_LABEL: Record<NumericField, string> = {
  gaTarget: "GA",
  c2cTarget: "C2C",
  scTarget: "SC",
  totalRechargeTarget: "Recharge",
  ssoTarget: "SSO",
  lsoTarget: "LSO",
  scAchieved: "SC Achieved",
};

function currentMonth() {
  return dhakaMonth();
}

export default function TargetsPage() {
  const canView = useCan("targets", "view");
  const canUpdate = useCan("targets", "update");
  const [month, setMonth] = useState(currentMonth()),
    [rows, setRows] = useState<TargetRow[]>([]),
    [bpRows, setBpRows] = useState<BpRow[]>([]);
  const [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [message, setMessage] = useState(""),
    [search, setSearch] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [uploading, setUploading] = useState(false),
    [uploadResult, setUploadResult] = useState<ImportResult | null>(null);

  async function load() {
    setLoading(true);
    const r = await fetch(`/api/targets?month=${month}`, { cache: "no-store" });
    const d = await r.json();
    if (r.ok) {
      setRows(d.rows || []);
      setBpRows(d.bpRows || []);
    } else setMessage(d.error || "Could not load targets");
    setLoading(false);
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  /**
   * Total recharge follows C2C + SC, but only while the operator has not typed
   * their own total: once it differs from the sum it is theirs and is left
   * alone. Unchanged from the pre-migration behaviour.
   */
  function update(i: number, k: NumericField, v: string) {
    const n = Math.max(0, Number(v) || 0);
    setRows((old) =>
      old.map((r, x) => {
        if (x !== i) return r;
        const next = { ...r, [k]: n };
        if (
          (k === "c2cTarget" || k === "scTarget") &&
          (!r.totalRechargeTarget || r.totalRechargeTarget === r.c2cTarget + r.scTarget)
        )
          next.totalRechargeTarget = (k === "c2cTarget" ? n : r.c2cTarget) + (k === "scTarget" ? n : r.scTarget);
        return next;
      }),
    );
  }

  async function save() {
    setSaving(true);
    setMessage("");
    const r = await fetch("/api/targets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ month, rows, bpRows }),
    });
    const d = await r.json();
    setSaving(false);
    setMessage(r.ok ? `Saved targets for ${month}.` : d.error || "Save failed");
    if (r.ok) await load();
  }

  async function upload() {
    if (!file) return;
    setUploading(true);
    setUploadResult(null);
    setMessage("Reading target file...");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("month", month);
    const r = await fetch("/api/targets/import", { method: "POST", body: fd });
    const d = await r.json();
    setUploading(false);
    if (!r.ok) {
      setMessage(d.error || "Target import failed");
      return;
    }
    setUploadResult(d);
    setMessage(`Target upload complete: ${d.updated} updated, ${d.failed} failed.`);
    setFile(null);
    await load();
  }

  const visible = useMemo(() => {
    const q = search.toLowerCase().trim();
    return rows.filter(
      (r) => !q || `${r.name} ${r.rsoMsisdn} ${r.employeeCode || ""} ${r.supervisor}`.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (a, r) => ({
          ga: a.ga + r.gaTarget,
          c2c: a.c2c + r.c2cTarget,
          sc: a.sc + r.scTarget,
          recharge: a.recharge + r.totalRechargeTarget,
          sso: a.sso + r.ssoTarget,
          lso: a.lso + r.lsoTarget,
        }),
        { ga: 0, c2c: 0, sc: 0, recharge: 0, sso: 0, lso: 0 },
      ),
    [rows],
  );

  if (!canView) return null;

  // Success is tested before failure: "…, 3 failed." is still a completed run.
  const tone = message
    ? /complete|saved|updated/i.test(message)
      ? "ok"
      : /failed|error|invalid/i.test(message)
        ? "bad"
        : "warn"
    : null;

  const cell = (r: TargetRow, i: number, k: NumericField) =>
    canUpdate ? (
      <input
        className="kit-input kit-num-input"
        type="number"
        min="0"
        value={r[k]}
        aria-label={`${FIELD_LABEL[k]} for ${r.name}`}
        onChange={(e) => update(i, k, e.target.value)}
      />
    ) : (
      <strong>{Number(r[k]).toLocaleString()}</strong>
    );

  const bpCell = (r: BpRow, i: number) =>
    canUpdate ? (
      <input
        className="kit-input kit-num-input"
        type="number"
        min="0"
        value={r.gaTarget}
        aria-label={`GA target for ${r.bpName || r.bpCode}`}
        onChange={(e) =>
          setBpRows((v) =>
            v.map((x, n) => (n === i ? { ...x, gaTarget: Math.max(0, Number(e.target.value) || 0) } : x)),
          )
        }
      />
    ) : (
      <strong>{r.gaTarget}</strong>
    );

  return (
    <main className="page">
      <PageHeader
        title="Monthly Target Control"
        subtitle="Set RSO and BP goals, import target workbooks and adjust values from one workspace."
        action={
          <label className="kit-field">
            <span>Target month</span>
            <input className="kit-input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </label>
        }
      />

      <SummaryStrip
        items={[
          { label: "GA", value: totals.ga.toLocaleString() },
          { label: "C2C", value: totals.c2c.toLocaleString() },
          { label: "SC", value: totals.sc.toLocaleString() },
          { label: "Recharge", value: totals.recharge.toLocaleString(), tone: "teal" },
          { label: "SSO", value: totals.sso.toLocaleString() },
          { label: "LSO", value: totals.lso.toLocaleString() },
        ]}
      />

      {message && tone && (
        <div className={`kit-note is-${tone}`} role={tone === "bad" ? "alert" : "status"}>
          <Icon name={tone === "ok" ? "check" : tone === "bad" ? "alert" : "info"} />
          <span>{message}</span>
        </div>
      )}

      {canUpdate && (
        <>
          <SectionHead
            title="Bulk import"
            sub={`RSO number or BP code + target type + target value, applied to ${month}.`}
            link={
              // A real <a>: a file download from an API route, which <Link>
              // would client-side navigate to instead.
              // eslint-disable-next-line @next/next/no-html-link-for-pages
              <a href="/api/samples/targets" className="kit-btn is-secondary size-sm">
                Download Sample
              </a>
            }
          />
          <Card className="kit-mb-20" padded="lg">
            <DropZone
              file={file}
              accept=".xlsx,.xls,.xlsm"
              hint="XLSX / XLS / XLSM · max 20 MB"
              onFile={setFile}
              disabled={uploading}
            />
            <div className="kit-form-actions">
              <button className="kit-btn is-primary size-md" disabled={!file || uploading} onClick={upload}>
                {uploading ? "Validating & importing…" : `Import targets for ${month}`}
              </button>
              {file && !uploading && (
                <button type="button" className="kit-btn is-ghost size-md" onClick={() => setFile(null)}>
                  Cancel
                </button>
              )}
            </div>
            {uploadResult && (
              <>
                <div className="kit-result-grid kit-mt-12">
                  <div>
                    <span>Total rows</span>
                    <strong>{Number(uploadResult.totalRows || 0).toLocaleString()}</strong>
                  </div>
                  <div>
                    <span>Updated</span>
                    <strong>{Number(uploadResult.updated || 0).toLocaleString()}</strong>
                  </div>
                  <div className={uploadResult.failed ? "is-warn" : undefined}>
                    <span>Failed</span>
                    <strong>{Number(uploadResult.failed || 0).toLocaleString()}</strong>
                  </div>
                </div>
                {uploadResult.errors?.length ? (
                  <details className="kit-details">
                    <summary>View {uploadResult.errors.length} row error(s)</summary>
                    {uploadResult.errors.map((e) => (
                      <div key={e}>{e}</div>
                    ))}
                  </details>
                ) : null}
              </>
            )}
          </Card>
        </>
      )}

      <SectionHead title="Employee targets" sub={`${visible.length} of ${rows.length} RSOs shown.`} />
      <div className="kit-filter-bar no-print">
        <div className="kit-search">
          <Icon name="search" />
          <input
            className="kit-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search RSO, code or supervisor"
            autoComplete="off"
            aria-label="Search RSO targets"
          />
        </div>
      </div>
      <Card className="kit-mb-20" padded>
        {loading ? (
          <p className="kit-filter-note">Loading targets…</p>
        ) : visible.length ? (
          <>
            <div className="kit-table-wrap">
              <table className="kit-table">
                <thead>
                  <tr>
                    <th>RSO</th>
                    <th>Supervisor</th>
                    {numericFields.map((k) => (
                      <th key={k} className="is-right">
                        {FIELD_LABEL[k]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => {
                    const i = rows.findIndex((x) => x.employeeId === r.employeeId);
                    return (
                      <tr key={r.employeeId}>
                        <td>
                          <strong>{r.name}</strong>
                          <small>
                            {r.rsoMsisdn} · {r.employeeCode || "no code"}
                          </small>
                        </td>
                        <td>{r.supervisor}</td>
                        {numericFields.map((k) => (
                          <td key={k} className="is-right">
                            {cell(r, i, k)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="kit-table-cards">
              {visible.map((r) => {
                const i = rows.findIndex((x) => x.employeeId === r.employeeId);
                return (
                  <div className="kit-card kit-card-p" key={r.employeeId}>
                    <strong>{r.name}</strong>
                    <p className="kit-figure-sub">
                      {r.employeeCode || r.rsoMsisdn} · {r.supervisor} · {r.retailerCount} retailers
                    </p>
                    <div className="kit-form-grid kit-mt-10">
                      {numericFields.map((k) => (
                        <Field key={k} label={FIELD_LABEL[k]}>
                          {cell(r, i, k)}
                        </Field>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <EmptyState
            title={rows.length ? "No RSO matches that search" : "No RSO targets for this month"}
            hint={
              rows.length ? "Try a different name, code or supervisor." : "Import a target workbook to get started."
            }
            icon={<Icon name="target" />}
          />
        )}
      </Card>

      <SectionHead title="BP monthly GA targets" sub={`${bpRows.length} active BP assignments.`} />
      <Card className="kit-mb-20" padded>
        {bpRows.length ? (
          <>
            <div className="kit-table-wrap">
              <table className="kit-table">
                <thead>
                  <tr>
                    <th>BP Code</th>
                    <th>BP Name</th>
                    <th>RSO</th>
                    <th className="is-right">GA Target</th>
                  </tr>
                </thead>
                <tbody>
                  {bpRows.map((r, i) => (
                    <tr key={r.assignmentId}>
                      <td>
                        <strong>{r.bpCode}</strong>
                      </td>
                      <td>{r.bpName || "—"}</td>
                      <td>
                        {r.rsoName}
                        <small>{r.rsoMsisdn}</small>
                      </td>
                      <td className="is-right">{bpCell(r, i)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="kit-table-cards">
              {bpRows.map((r, i) => (
                <div className="kit-card kit-card-p" key={r.assignmentId}>
                  <strong>{r.bpName || r.bpCode}</strong>
                  <p className="kit-figure-sub">
                    {r.bpCode} · RSO {r.rsoName}
                  </p>
                  <div className="kit-mt-10">
                    <Field label="GA target">{bpCell(r, i)}</Field>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <EmptyState
            title="No active BP assignments"
            hint="A BP appears here once it holds a live assignment."
            icon={<Icon name="sim" />}
          />
        )}
      </Card>

      {canUpdate && (
        <div className="kit-save-bar no-print">
          <span>
            {rows.length} RSO · {bpRows.length} BP records
          </span>
          <button className="kit-btn is-primary size-md" disabled={saving || loading} onClick={save}>
            {saving ? "Saving…" : "Save all changes"}
          </button>
        </div>
      )}
    </main>
  );
}
