"use client";

/**
 * Retailer Master import — migrated to the role-UI kit.
 *
 * RETAILER_CODE is the unique key: an existing code is updated, a new one is
 * created, and nothing is duplicated. The result grid reports all seven counts
 * the API returns rather than a single "done", because "new vs updated vs
 * unassigned" is exactly what tells an operator whether the file was the one
 * they meant to upload.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useCan } from "../../../components/PermissionContext";
import { Icon } from "../../../components/icons";
import { Card, DropZone, PageHeader, SectionHead, SummaryStrip } from "../../../components/Kit";

type Summary = { retailers: number; mappedRetailers: number; unassignedRetailers: number };
type ImportResult = {
  totalRows?: number;
  newRows?: number;
  updatedRows?: number;
  unchangedRows?: number;
  mappedRows?: number;
  unassignedRows?: number;
  failedRows?: number;
};

const FIELDS = [
  "RETAILER_CODE",
  "RETAILER_NAME",
  "SIM_SELLER",
  "I_TOP_UP_SELLER",
  "TRANMOBILENO",
  "I_TOP_UP_SR_NUMBER",
  "I_TOP_UP_NUMBER",
  "CATEGORY",
  "RSOCODE",
  "ROUTE",
];

export default function Page() {
  const canView = useCan("retailers", "view"),
    canAdd = useCan("retailers", "add");
  const [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [result, setResult] = useState<ImportResult | null>(null),
    [summary, setSummary] = useState<Summary>({ retailers: 0, mappedRetailers: 0, unassignedRetailers: 0 });

  const refresh = useCallback(async () => {
    const r = await fetch("/api/master/summary", { cache: "no-store" });
    if (r.ok) setSummary(await r.json());
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  async function upload() {
    if (!file) return;
    setBusy(true);
    setMessage("Validating retailer file and comparing it with current master data...");
    setResult(null);
    const form = new FormData();
    form.append("file", file);
    const r = await fetch("/api/master/import/retailers", { method: "POST", body: form });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) {
      setMessage(d.error || "Retailer import failed");
      return;
    }
    setResult(d);
    setMessage("Retailer import completed.");
    setFile(null);
    await refresh();
  }

  if (!canView) return null;

  const tone = result ? "ok" : /failed|invalid|missing|error/i.test(message) ? "bad" : "warn";

  return (
    <main className="page">
      <Link href="/admin/upload" className="kit-detail-back">
        <Icon name="arrow" /> Upload Center
      </Link>
      <PageHeader
        title="Retailer List"
        subtitle="Add new retailers or update existing retailer information using RETAILER_CODE as the unique key."
      />

      <SummaryStrip
        items={[
          { label: "Total Retailers", value: summary.retailers.toLocaleString() },
          { label: "Mapped", value: summary.mappedRetailers.toLocaleString(), tone: "teal" },
          { label: "Unassigned", value: summary.unassignedRetailers.toLocaleString(), tone: "amber" },
        ]}
      />

      {canAdd && (
        <>
          <SectionHead
            title="Upload retailer list"
            sub=".xlsx, .xls or .xlsm"
            link={
              // A real <a>: this is a file download from an API route, and
              // <Link> would client-side navigate to it instead.
              // eslint-disable-next-line @next/next/no-html-link-for-pages
              <a href="/api/samples/retailers" className="kit-btn is-secondary size-sm">
                Download Sample
              </a>
            }
          />
          <Card className="kit-mb-20" padded="lg">
            <DropZone
              file={file}
              accept=".xlsx,.xls,.xlsm"
              hint="Excel workbook, .xlsx / .xls / .xlsm"
              onFile={setFile}
              disabled={busy}
            />
            <div className="kit-form-actions">
              <button onClick={upload} disabled={!file || busy} className="kit-btn is-primary size-md">
                {busy ? "Processing…" : "Validate & Import"}
              </button>
              {file && !busy && (
                <button type="button" onClick={() => setFile(null)} className="kit-btn is-ghost size-md">
                  Cancel
                </button>
              )}
            </div>

            {message && (
              <div className={`kit-note is-${tone} is-last`} role={tone === "bad" ? "alert" : "status"}>
                <Icon name={tone === "ok" ? "check" : tone === "bad" ? "alert" : "info"} />
                <span>{message}</span>
              </div>
            )}

            {result && (
              <div className="kit-result-grid kit-mt-12">
                <Result label="Total Rows" value={result.totalRows} />
                <Result label="New" value={result.newRows} />
                <Result label="Updated" value={result.updatedRows} />
                <Result label="Unchanged" value={result.unchangedRows} />
                <Result label="Mapped" value={result.mappedRows} />
                <Result label="Unassigned" value={result.unassignedRows} />
                <Result label="Invalid" value={result.failedRows} warn />
              </div>
            )}
          </Card>
        </>
      )}

      <SectionHead title="Expected retailer fields" sub="Required column headings in the source workbook." />
      <Card padded="lg">
        <div className="kit-codes">
          {FIELDS.map((x) => (
            <code key={x}>{x}</code>
          ))}
        </div>
        <p className="kit-filter-note">
          I_TOP_UP_SR_NUMBER is matched against the employee RSO MSISDN. Existing RETAILER_CODE values are updated
          instead of duplicated.
        </p>
      </Card>
    </main>
  );
}

/** `warn` only tints when the count is non-zero — a zero invalid row is good news. */
function Result({ label, value, warn }: { label: string; value?: number; warn?: boolean }) {
  const n = Number(value || 0);
  return (
    <div className={warn && n > 0 ? "is-warn" : undefined}>
      <span>{label}</span>
      <strong>{n.toLocaleString()}</strong>
    </div>
  );
}
