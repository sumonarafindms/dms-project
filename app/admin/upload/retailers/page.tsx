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
import { AppLink as Link } from "../../../components/AppLink";
import { useCan } from "../../../components/PermissionContext";
import { Icon } from "../../../components/icons";
import { Btn, Card, DropZone, LinkBtn, PageHeader, SectionHead, SummaryStrip } from "../../../components/Kit";
import { apiFetch, apiUpload } from "@/lib/api-client";

type Summary = { retailers: number; mappedRetailers: number; unassignedRetailers: number };
type ImportResult = {
  totalRows?: number;
  newRows?: number;
  updatedRows?: number;
  unchangedRows?: number;
  mappedRows?: number;
  unassignedRows?: number;
  failedRows?: number;
  /** Set when the file imported but connected to no RSO. See lib/master-import.ts. */
  mappingWarning?: string | null;
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
    const r = await apiFetch<Summary>("/api/master/summary", { cache: "no-store" });
    if (r.ok) setSummary(r.data);
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
    const r = await apiUpload<ImportResult>("/api/master/import/retailers", form);
    setBusy(false);
    if (!r.ok) {
      setMessage(r.message);
      return;
    }
    setResult(r.data);
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
          { label: "Total Retailers", value: summary.retailers.toLocaleString("en-US") },
          { label: "Mapped", value: summary.mappedRetailers.toLocaleString("en-US"), tone: "brand" },
          { label: "Unassigned", value: summary.unassignedRetailers.toLocaleString("en-US"), tone: "amber" },
        ]}
      />

      {canAdd && (
        <>
          <SectionHead
            title="Upload retailer list"
            sub=".xlsx, .xls or .xlsm"
            link={
              // `external`: a real <a>, because this is a file download from
              // an API route and <Link> would client-side navigate to it.
              <LinkBtn href="/api/samples/retailers" external variant="secondary" size="sm">
                Download Sample
              </LinkBtn>
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
              <Btn variant="primary" onClick={upload} disabled={!file || busy}>
                {busy ? "Processing…" : "Validate & Import"}
              </Btn>
              {file && !busy && (
                <Btn variant="ghost" type="button" onClick={() => setFile(null)}>
                  Cancel
                </Btn>
              )}
            </div>

            {message && (
              <div className={`kit-note is-${tone} is-last`} role={tone === "bad" ? "alert" : "status"}>
                <Icon name={tone === "ok" ? "check" : tone === "bad" ? "alert" : "info"} />
                <span>{message}</span>
              </div>
            )}

            {result?.mappingWarning && (
              /*
               * Above the counts, not beside them. The counts were always
               * shown — "mapped 0 · unassigned 2190" — and still read as a
               * successful import, because a number is not a diagnosis.
               */
              <div className="kit-note is-bad is-last kit-mt-12" role="alert">
                <Icon name="alert" />
                <span>{result.mappingWarning}</span>
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
      <strong>{n.toLocaleString("en-US")}</strong>
    </div>
  );
}
