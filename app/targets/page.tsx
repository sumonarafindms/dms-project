"use client";

/**
 * Monthly target control.
 *
 * Two tables (RSO targets, BP GA targets) plus a bulk importer, all for one
 * month. Nothing is written until "Save all changes".
 *
 * ## Why the tables are read-only and editing happens in a dialog
 *
 * Every figure used to be a live `<input type="number">`, seven per RSO across
 * twenty rows. That is a real hazard, not an aesthetic one: **a number input
 * with focus changes its value when the mouse wheel moves over it.** Scrolling
 * down a page of targets was enough to silently rewrite one, and because the
 * page saves the whole grid at once, the wrong number went to the database with
 * everything else. Nothing in the UI would have said so.
 *
 * So the tables now show values, and each row carries an Edit button that opens
 * that person's targets in a dialog. Three things follow from that:
 *
 * - Scrolling cannot change anything, because there is nothing focusable to
 *   scroll over.
 * - The dialog has room for full-width fields and their labels, which the
 *   seven-column grid never did — on a phone those cells were unusable.
 * - What is being edited is unambiguous: the person's name and supervisor are
 *   in the dialog header, rather than inferred from which row the cursor is on.
 *
 * `onWheel` is still blocked on the dialog's inputs. The dialog is short, but
 * "short enough not to scroll" is not a guarantee, and the failure is silent.
 *
 * Each table is rendered twice — a table from 640px, one card per record below
 * it — because the identity columns do not fit a phone.
 */

import { useEffect, useMemo, useState } from "react";
import { useCan } from "../components/PermissionContext";
import { dhakaMonth } from "../../lib/business-time";
import {
  Btn,
  Card,
  DropZone,
  EmptyState,
  Field,
  LinkBtn,
  Modal,
  PageHeader,
  SectionHead,
  SummaryStrip,
  NumberInput,
} from "../components/Kit";
import { Icon } from "../components/icons";
import { apiFetch, apiSend, apiUpload } from "@/lib/api-client";

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
type TargetsPayload = { rows?: TargetRow[]; bpRows?: BpRow[] };
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
  /*
   * Which record the dialog is editing, and a working copy of it.
   *
   * The draft is separate from `rows` so Cancel really cancels: editing the row
   * in place and "undoing" by reloading would throw away every other unsaved
   * change on the page.
   */
  const [editing, setEditing] = useState<{ kind: "rso"; id: string } | { kind: "bp"; id: string } | null>(null);
  const [draft, setDraft] = useState<Record<string, number>>({});

  async function load() {
    setLoading(true);
    const r = await apiFetch<TargetsPayload>(`/api/targets?month=${month}`, { cache: "no-store" });
    if (r.ok) {
      setRows(r.data.rows || []);
      setBpRows(r.data.bpRows || []);
    } else setMessage(r.message);
    setLoading(false);
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  /**
   * Total recharge follows C2C + SC, but only while the operator has not typed
   * their own total: once it differs from the sum it is theirs and is left
   * alone. Unchanged from the pre-dialog behaviour, applied to the draft.
   */
  function setDraftField(k: NumericField, v: string) {
    const n = Math.max(0, Number(v) || 0);
    setDraft((d) => {
      const next = { ...d, [k]: n };
      if (
        (k === "c2cTarget" || k === "scTarget") &&
        (!d.totalRechargeTarget || d.totalRechargeTarget === (d.c2cTarget ?? 0) + (d.scTarget ?? 0))
      )
        next.totalRechargeTarget =
          (k === "c2cTarget" ? n : (d.c2cTarget ?? 0)) + (k === "scTarget" ? n : (d.scTarget ?? 0));
      return next;
    });
  }

  function openRso(r: TargetRow) {
    setDraft(Object.fromEntries(numericFields.map((k) => [k, r[k]])));
    setEditing({ kind: "rso", id: r.employeeId });
  }
  function openBp(r: BpRow) {
    setDraft({ gaTarget: r.gaTarget });
    setEditing({ kind: "bp", id: r.assignmentId });
  }

  /**
   * Apply the draft to the page's state and close.
   *
   * Still nothing goes to the server here — "Save all changes" at the bottom is
   * the one write, exactly as before. This dialog changes where a number is
   * typed, not when it is persisted.
   */
  function applyDraft() {
    if (!editing) return;
    if (editing.kind === "rso")
      setRows((old) => old.map((r) => (r.employeeId === editing.id ? { ...r, ...draft } : r)));
    else
      setBpRows((old) =>
        old.map((r) => (r.assignmentId === editing.id ? { ...r, gaTarget: draft.gaTarget ?? r.gaTarget } : r)),
      );
    setEditing(null);
  }

  async function save() {
    setSaving(true);
    setMessage("");
    const r = await apiSend("/api/targets", "POST", { month, rows, bpRows });
    setSaving(false);
    setMessage(r.ok ? `Saved targets for ${month}.` : r.message);
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
    const r = await apiUpload<ImportResult>("/api/targets/import", fd);
    setUploading(false);
    if (!r.ok) {
      setMessage(r.message);
      return;
    }
    setUploadResult(r.data);
    setMessage(`Target upload complete: ${r.data.updated} updated, ${r.data.failed} failed.`);
    setFile(null);
    await load();
  }

  const visible = useMemo(() => {
    const q = search.toLowerCase().trim();
    return rows.filter(
      (r) => !q || `${r.name} ${r.rsoMsisdn} ${r.employeeCode || ""} ${r.supervisor}`.toLowerCase().includes(q),
    );
  }, [rows, search]);

  /*
   * v152 added an index map here to kill a quadratic `rows.findIndex(...)` that
   * ran once per rendered row, twice over, on every keystroke. v153 removed the
   * need for it entirely: the table renders values rather than inputs, and the
   * dialog looks its record up by id. The fastest version of a lookup is the
   * one no longer performed.
   */

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

  const figure = (n: number) => <strong>{Number(n).toLocaleString()}</strong>;

  /**
   * A number field inside the dialog.
   *
   * `NumberInput` rather than a raw input: the wheel guard lives in the kit now,
   * because writing it here is what let two other fields ship without it.
   */
  const draftField = (k: NumericField, label: string) => (
    <Field key={k} label={label}>
      <NumberInput min="0" value={draft[k] ?? 0} onChange={(e) => setDraftField(k, e.target.value)} />
    </Field>
  );

  const editingRso = editing?.kind === "rso" ? rows.find((r) => r.employeeId === editing.id) : undefined;
  const editingBp = editing?.kind === "bp" ? bpRows.find((r) => r.assignmentId === editing.id) : undefined;

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
              // `external`: a real <a>, because a file download from an API
              // route is not something <Link> should client-side navigate to.
              <LinkBtn href="/api/samples/targets" external variant="secondary" size="sm">
                Download Sample
              </LinkBtn>
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
              <Btn disabled={!file || uploading} onClick={upload}>
                {uploading ? "Validating & importing…" : `Import targets for ${month}`}
              </Btn>
              {file && !uploading && (
                <Btn variant="ghost" type="button" onClick={() => setFile(null)}>
                  Cancel
                </Btn>
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
            <div className="kit-table-wrap" tabIndex={0} role="group" aria-label="Table, scrolls sideways">
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
                    {canUpdate && <th className="is-right">Edit</th>}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
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
                          {figure(r[k])}
                        </td>
                      ))}
                      {canUpdate && (
                        <td className="is-right">
                          <Btn variant="secondary" size="sm" onClick={() => openRso(r)}>
                            <Icon name="settings" /> Edit
                          </Btn>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="kit-table-cards">
              {visible.map((r) => (
                <div className="kit-card kit-card-p" key={r.employeeId}>
                  <strong>{r.name}</strong>
                  <p className="kit-figure-sub">
                    {r.employeeCode || r.rsoMsisdn} · {r.supervisor} · {r.retailerCount} retailers
                  </p>
                  <div className="kit-form-grid kit-mt-10">
                    {numericFields.map((k) => (
                      <Field key={k} label={FIELD_LABEL[k]}>
                        {figure(r[k])}
                      </Field>
                    ))}
                  </div>
                  {canUpdate && (
                    <Btn variant="secondary" size="sm" block className="kit-mt-10" onClick={() => openRso(r)}>
                      <Icon name="settings" /> Edit targets
                    </Btn>
                  )}
                </div>
              ))}
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
            <div className="kit-table-wrap" tabIndex={0} role="group" aria-label="Table, scrolls sideways">
              <table className="kit-table">
                <thead>
                  <tr>
                    <th>BP Code</th>
                    <th>BP Name</th>
                    <th>RSO</th>
                    <th className="is-right">GA Target</th>
                    {canUpdate && <th className="is-right">Edit</th>}
                  </tr>
                </thead>
                <tbody>
                  {bpRows.map((r) => (
                    <tr key={r.assignmentId}>
                      <td>
                        <strong>{r.bpCode}</strong>
                      </td>
                      <td>{r.bpName || "—"}</td>
                      <td>
                        {r.rsoName}
                        <small>{r.rsoMsisdn}</small>
                      </td>
                      <td className="is-right">{figure(r.gaTarget)}</td>
                      {canUpdate && (
                        <td className="is-right">
                          <Btn variant="secondary" size="sm" onClick={() => openBp(r)}>
                            <Icon name="settings" /> Edit
                          </Btn>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="kit-table-cards">
              {bpRows.map((r) => (
                <div className="kit-card kit-card-p" key={r.assignmentId}>
                  <strong>{r.bpName || r.bpCode}</strong>
                  <p className="kit-figure-sub">
                    {r.bpCode} · RSO {r.rsoName}
                  </p>
                  <div className="kit-mt-10">
                    <Field label="GA target">{figure(r.gaTarget)}</Field>
                  </div>
                  {canUpdate && (
                    <Btn variant="secondary" size="sm" block className="kit-mt-10" onClick={() => openBp(r)}>
                      <Icon name="settings" /> Edit target
                    </Btn>
                  )}
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

      {editingRso && (
        <Modal
          title={editingRso.name}
          sub={`${editingRso.supervisor} · ${editingRso.rsoMsisdn} · ${editingRso.retailerCount} retailers · ${month}`}
          onClose={() => setEditing(null)}
          footer={
            <>
              <Btn variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Btn>
              <Btn onClick={applyDraft}>Update targets</Btn>
            </>
          }
        >
          <div className="kit-form-grid">{numericFields.map((k) => draftField(k, FIELD_LABEL[k]))}</div>
          {/* The dialog only edits this page's copy. Saying so here stops
              someone closing the browser after "Update" and expecting it to
              have been written. */}
          <p className="kit-hint is-xs kit-mt-10">
            Changes apply when you press <b>Save all changes</b> at the bottom of the page.
          </p>
        </Modal>
      )}

      {editingBp && (
        <Modal
          title={editingBp.bpName || editingBp.bpCode}
          sub={`${editingBp.bpCode} · RSO ${editingBp.rsoName} · ${month}`}
          onClose={() => setEditing(null)}
          footer={
            <>
              <Btn variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Btn>
              <Btn onClick={applyDraft}>Update target</Btn>
            </>
          }
        >
          <div className="kit-form-grid">{draftField("gaTarget", "GA target")}</div>
          <p className="kit-hint is-xs kit-mt-10">
            Changes apply when you press <b>Save all changes</b> at the bottom of the page.
          </p>
        </Modal>
      )}

      {canUpdate && (
        <div className="kit-save-bar no-print">
          <span>
            {rows.length} RSO · {bpRows.length} BP records
          </span>
          <Btn disabled={saving || loading} onClick={save}>
            {saving ? "Saving…" : "Save all changes"}
          </Btn>
        </div>
      )}
    </main>
  );
}
