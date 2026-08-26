"use client";

import { useEffect, useState } from "react";

type Summary = {
  supervisors: number;
  employees: number;
  retailers: number;
  mappedRetailers: number;
  unassignedRetailers: number;
  pagination?: {page:number;pageSize:number;total:number;totalPages:number;hasNext:boolean;hasPrevious:boolean};
  employeeRows: Array<{
    id: string;
    employeeCode: string | null;
    rsoMsisdn: string;
    name: string;
    supervisor: string;
    retailerCount: number;
  }>;
};

const emptySummary: Summary = {
  supervisors: 0,
  employees: 0,
  retailers: 0,
  mappedRetailers: 0,
  unassignedRetailers: 0,
  employeeRows: [],
};

function UploadBox({ type, title, hint, onDone }: { type: "employees" | "retailers"; title: string; hint: string; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function upload() {
    if (!file) return;
    setBusy(true);
    setMessage("");
    const form = new FormData();
    form.append("file", file);
    const response = await fetch(`/api/master/import/${type}`, { method: "POST", body: form });
    const data = await response.json();
    if (!response.ok) setMessage(`Error: ${data.error ?? "Import failed"}`);
    else {
      const mapping = type === "retailers" ? ` • mapped ${data.mappedRows} • unassigned ${data.unassignedRows}` : "";
      setMessage(`Imported ${data.successRows}/${data.totalRows}${mapping}`);
      onDone();
    }
    setBusy(false);
  }

  return (
    <section style={styles.panel}>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      <p style={styles.muted}>{hint}</p>
      <label>
        <span className="sr-only">Choose {title} import file</span>
        <input type="file" accept=".xlsx,.xls,.xlsm" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
      </label>
      <div style={{ marginTop: 14 }}>
        <button onClick={upload} disabled={!file || busy} style={styles.button}>
          {busy ? "Importing..." : `Import ${title}`}
        </button>
      </div>
      {message && <p style={{ marginBottom: 0 }}>{message}</p>}
    </section>
  );
}

export default function MasterDataPage() {
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  async function refresh(nextPage=page) {
    setLoading(true);
    const response = await fetch(`/api/master/summary?page=${nextPage}&pageSize=50`, { cache: "no-store" });
    if (response.ok) setSummary(await response.json());
    setLoading(false);
  }

  useEffect(() => { void refresh(page); }, [page]);

  return (
    <main style={styles.main}>
      <div style={styles.topbar}>
        <div>
          <h1 style={{ margin: 0 }}>Master Data</h1>
          <p style={styles.muted}>Supervisor → Employee → Retailer mapping</p>
        </div>
        <a href="/dashboard" style={styles.link}>Dashboard</a>
      </div>

      <div style={styles.cards}>
        {[
          ["Supervisors", summary.supervisors],
          ["Employees", summary.employees],
          ["Retailers", summary.retailers],
          ["Mapped", summary.mappedRetailers],
          ["Unassigned", summary.unassignedRetailers],
        ].map(([label, value]) => (
          <div key={String(label)} style={styles.card}><div style={styles.muted}>{label}</div><strong style={{ fontSize: 28 }}>{loading ? "…" : value}</strong></div>
        ))}
      </div>

      <div style={styles.twoCols}>
        <UploadBox
          type="employees"
          title="Employees"
          hint="Reads RSO Code, RS0 MSISDN, RSO Name and Supervisor. Supervisors are created automatically."
          onDone={refresh}
        />
        <UploadBox
          type="retailers"
          title="Retailers"
          hint="Uses I_TOP_UP_SR_NUMBER to match Employee RS0 MSISDN. Existing RETAILER_CODE rows are updated, not duplicated."
          onDone={refresh}
        />
      </div>

      <section style={{ ...styles.panel, marginTop: 20, overflowX: "auto" }}>
        <h2 style={{ marginTop: 0 }}>Employee retailer mapping</h2>
        <table style={styles.table}>
          <thead><tr><th>RSO Code</th><th>Employee</th><th>RSO MSISDN</th><th>Supervisor</th><th style={{ textAlign: "right" }}>Retailers</th></tr></thead>
          <tbody>
            {summary.employeeRows.map((row) => (
              <tr key={row.id}><td>{row.employeeCode ?? "-"}</td><td>{row.name}</td><td>{row.rsoMsisdn}</td><td>{row.supervisor}</td><td style={{ textAlign: "right", fontWeight: 700 }}>{row.retailerCount}</td></tr>
            ))}
            {!loading && !summary.employeeRows.length && <tr><td colSpan={5} style={{ padding: 20, textAlign: "center" }}>Import Employees first, then Retailers.</td></tr>}
          </tbody>
        </table>
        {(summary.pagination?.totalPages||1)>1 && <div className="pagination-v83" aria-label="Employee mapping pages">
          <button type="button" disabled={!summary.pagination?.hasPrevious} onClick={()=>setPage(p=>Math.max(1,p-1))}>Previous</button>
          <span>Page {summary.pagination?.page||1} of {summary.pagination?.totalPages||1}</span>
          <button type="button" disabled={!summary.pagination?.hasNext} onClick={()=>setPage(p=>p+1)}>Next</button>
        </div>}
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: { padding: 28, maxWidth: 1200, margin: "0 auto" },
  topbar: { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" },
  muted: { color: "#667085" },
  link: { color: "#175cd3", fontWeight: 700, textDecoration: "none" },
  cards: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, margin: "22px 0" },
  card: { background: "white", border: "1px solid #e4e7ec", borderRadius: 12, padding: 16 },
  twoCols: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 18 },
  panel: { background: "white", border: "1px solid #e4e7ec", borderRadius: 14, padding: 20 },
  button: { border: 0, borderRadius: 8, padding: "10px 16px", background: "#175cd3", color: "white", fontWeight: 700, cursor: "pointer" },
  table: { width: "100%", borderCollapse: "collapse", minWidth: 720 },
};
