"use client";

/**
 * Master Data — migrated to the role-UI kit.
 *
 * This was the last page still carrying its own `styles` object: hardcoded
 * hex colours outside the token system, a `minWidth: 720` table with no card
 * fallback (unusable on a phone), and a `pagination-v83` class that no
 * stylesheet has defined since v83, so the pager rendered unstyled.
 *
 * The two importers here overlap with the Upload Center's own retailer
 * module. Both are kept because this page pairs them with the mapping table —
 * import employees, import retailers, then see immediately which RSOs the
 * retailers landed on, which is the whole point of the screen.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, DropZone, EmptyState, PageHeader, SectionHead, SummaryStrip, Table } from "../components/Kit";
import { Icon } from "../components/icons";

type EmployeeRow = {
  id: string;
  employeeCode: string | null;
  rsoMsisdn: string;
  name: string;
  supervisor: string;
  retailerCount: number;
};

type Summary = {
  supervisors: number;
  employees: number;
  retailers: number;
  mappedRetailers: number;
  unassignedRetailers: number;
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
  employeeRows: EmployeeRow[];
};

const emptySummary: Summary = {
  supervisors: 0,
  employees: 0,
  retailers: 0,
  mappedRetailers: 0,
  unassignedRetailers: 0,
  employeeRows: [],
};

function UploadBox({
  type,
  title,
  hint,
  onDone,
}: {
  type: "employees" | "retailers";
  title: string;
  hint: string;
  onDone: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"ok" | "bad">("ok");

  async function upload() {
    if (!file) return;
    setBusy(true);
    setMessage("");
    const form = new FormData();
    form.append("file", file);
    const response = await fetch(`/api/master/import/${type}`, { method: "POST", body: form });
    const data = await response.json();
    if (!response.ok) {
      setTone("bad");
      setMessage(data.error ?? "Import failed");
    } else {
      const mapping = type === "retailers" ? ` • mapped ${data.mappedRows} • unassigned ${data.unassignedRows}` : "";
      setTone("ok");
      setMessage(`Imported ${data.successRows}/${data.totalRows}${mapping}`);
      onDone();
    }
    setBusy(false);
  }

  return (
    <Card padded="lg">
      <SectionHead title={title} sub={hint} />
      <DropZone
        file={file}
        accept=".xlsx,.xls,.xlsm"
        hint="Excel workbook, .xlsx / .xls / .xlsm"
        onFile={setFile}
        disabled={busy}
      />
      <div className="kit-form-actions">
        <button onClick={upload} disabled={!file || busy} className="kit-btn is-primary size-md">
          {busy ? "Importing…" : `Import ${title}`}
        </button>
        {file && !busy && (
          <button type="button" onClick={() => setFile(null)} className="kit-btn is-ghost size-md">
            Cancel
          </button>
        )}
      </div>
      {message && (
        <div className={`kit-note is-${tone} is-last`} role={tone === "bad" ? "alert" : "status"}>
          <Icon name={tone === "bad" ? "alert" : "check"} />
          <span>{message}</span>
        </div>
      )}
    </Card>
  );
}

export default function MasterDataPage() {
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const refresh = useCallback(async (nextPage: number) => {
    setLoading(true);
    const response = await fetch(`/api/master/summary?page=${nextPage}&pageSize=50`, { cache: "no-store" });
    if (response.ok) setSummary(await response.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh(page);
  }, [page, refresh]);

  const dash = (n: number) => (loading ? "…" : n.toLocaleString());
  const pager = summary.pagination;

  return (
    <main className="page">
      <PageHeader
        title="Master Data"
        subtitle="Supervisor → Employee → Retailer mapping"
        action={
          <Link href="/dashboard" className="kit-btn is-secondary size-sm">
            Dashboard
          </Link>
        }
      />

      <SummaryStrip
        items={[
          { label: "Supervisors", value: dash(summary.supervisors) },
          { label: "Employees", value: dash(summary.employees) },
          { label: "Retailers", value: dash(summary.retailers) },
          { label: "Mapped", value: dash(summary.mappedRetailers), tone: "teal" },
          { label: "Unassigned", value: dash(summary.unassignedRetailers), tone: "amber" },
        ]}
      />

      <div className="kit-card-grid is-pair kit-mb-20">
        <UploadBox
          type="employees"
          title="Employees"
          hint="Reads RSO Code, RS0 MSISDN, RSO Name and Supervisor. Supervisors are created automatically."
          onDone={() => refresh(page)}
        />
        <UploadBox
          type="retailers"
          title="Retailers"
          hint="Uses I_TOP_UP_SR_NUMBER to match Employee RS0 MSISDN. Existing RETAILER_CODE rows are updated, not duplicated."
          onDone={() => refresh(page)}
        />
      </div>

      <SectionHead title="Employee retailer mapping" sub="Which RSO each imported retailer landed on." />
      <Card padded>
        <Table<EmployeeRow>
          columns={[
            { key: "employeeCode", label: "RSO Code", render: (r) => r.employeeCode ?? "—" },
            { key: "name", label: "Employee" },
            { key: "rsoMsisdn", label: "RSO MSISDN" },
            { key: "supervisor", label: "Supervisor" },
            {
              key: "retailerCount",
              label: "Retailers",
              align: "right",
              render: (r) => <strong>{r.retailerCount.toLocaleString()}</strong>,
            },
          ]}
          rows={summary.employeeRows}
          empty={
            <EmptyState
              title={loading ? "Loading mapping…" : "No mapping yet"}
              hint={loading ? undefined : "Import Employees first, then Retailers."}
              icon={<Icon name="users" />}
            />
          }
        />
        {(pager?.totalPages || 1) > 1 && (
          <div className="kit-pagination" aria-label="Employee mapping pages">
            <button type="button" disabled={!pager?.hasPrevious} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Previous
            </button>
            <span>
              Page {pager?.page || 1} of {pager?.totalPages || 1}
            </span>
            <button type="button" disabled={!pager?.hasNext} onClick={() => setPage((p) => p + 1)}>
              Next
            </button>
          </div>
        )}
      </Card>
    </main>
  );
}
