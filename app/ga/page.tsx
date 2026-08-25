"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {useCan} from "../components/PermissionContext";

type EmployeeRow = {
  employeeId: string;
  employeeCode?: string | null;
  name: string;
  rsoMsisdn: string;
  supervisor: string;
  retailerCount: number;
  ga150: number;
  ga300: number;
  gaAchieved: number;
  gaTarget: number;
  gaPercent: number;
  ssoAchieved: number;
  ssoTarget: number;
};

type RetailerDailyRow = {
  retailerCode: string;
  retailerName: string;
  employee: string;
  rsoMsisdn: string;
  supervisor: string;
  total: number;
  ga150: number;
  ga300: number;
};

type History = {
  id: string;
  fileName: string;
  uploadedAt: string;
  businessDate?: string | null;
  totalRows: number;
  successRows: number;
  failedRows: number;
  duplicateRows: number;
  status: string;
};

function ymdLocal(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return ymdLocal(d);
}

function prettyDate(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
}

export default function GaPage() {
  const canAdd=useCan("ga","add");
  const [month, setMonth] = useState(() => yesterday().slice(0, 7));
  const [dataDate, setDataDate] = useState(yesterday());
  const [fromDate,setFromDate]=useState(()=>`${yesterday().slice(0,7)}-01`);
  const [toDate,setToDate]=useState(yesterday());
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [retailerDaily, setRetailerDaily] = useState<RetailerDailyRow[]>([]);
  const [history, setHistory] = useState<History[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    const params = new URLSearchParams({ month: `${month}-01`, date: dataDate, from:fromDate, to:toDate });
    const res = await fetch(`/api/ga/summary?${params.toString()}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || "Failed to load GA data");
      return;
    }
    setRows(data.rows || []);
    setRetailerDaily(data.retailerDaily || []);
    setHistory(data.importHistory || []);
  }

  useEffect(() => {
    load();
  }, [month, dataDate,fromDate,toDate]);

  function changeDataDate(value: string) {
    setDataDate(value);
    if (value?.length >= 7) setMonth(value.slice(0, 7));
  }
  function changeFrom(value:string){setFromDate(value);if(value?.length>=7)setMonth(value.slice(0,7));if(toDate<value)setToDate(value)}

  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const input = form.elements.namedItem("file") as HTMLInputElement;
    if (!input.files?.[0]) return;

    setLoading(true);
    setMessage("Uploading and checking activation data...");
    const body = new FormData();
    body.append("file", input.files[0]);
    body.append("businessDate", dataDate);

    const res = await fetch("/api/import/GA", { method: "POST", body });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setMessage(data.error || "GA import failed");
      return;
    }

    if (data.duplicate) {
      setMessage(`This exact file was already imported for ${prettyDate(data.businessDate)}. No GA was counted twice.`);
    } else {
      setMessage(
        `GA import complete for ${data.businessDate}: ${data.insertedRows} new SIM, ${data.updatedRows} corrected SIM, ${data.duplicateRows} duplicate SIM ignored, ${data.failedRows} failed row(s).`,
      );
    }

    input.value = "";
    await load();
  }

  const totals = useMemo(() => rows.reduce(
    (a, r) => ({
      target: a.target + r.gaTarget,
      achieved: a.achieved + r.gaAchieved,
      ga150: a.ga150 + r.ga150,
      ga300: a.ga300 + r.ga300,
      ssoT: a.ssoT + r.ssoTarget,
      ssoA: a.ssoA + r.ssoAchieved,
    }),
    { target: 0, achieved: 0, ga150: 0, ga300: 0, ssoT: 0, ssoA: 0 },
  ), [rows]);

  const dayTotals = useMemo(() => retailerDaily.reduce(
    (a, r) => ({ total: a.total + r.total, ga150: a.ga150 + r.ga150, ga300: a.ga300 + r.ga300 }),
    { total: 0, ga150: 0, ga300: 0 },
  ), [retailerDaily]);

  const uploadPanel = canAdd ? (
    <section className="card modern-upload-panel">
            <div style={uploadTitleRow}><h2 style={{ margin: 0 }}>Upload Activation Details</h2><a href="/api/samples/ga" style={sampleLink}>Download Sample File</a></div>
            <form onSubmit={upload} style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "end" }}>
              <label>
                GA Data Date<br />
                <input
                  name="businessDate"
                  type="date"
                  value={dataDate}
                  onChange={(e) => changeDataDate(e.target.value)}
                  required
                  style={inputStyle}
                />
              </label>
              <label>
                ActivationDetailsReport.xlsx<br />
                <input name="file" type="file" accept=".xlsx,.xlsm,.xls" required style={{ marginTop: 10 }} />
              </label>
              <button disabled={loading} style={button}>{loading ? "Processing..." : "Upload GA"}</button>
            </form>
    
            <div style={ruleBox}>
              <b>GA counting rule:</b> Total = all unique SIM activations for a retailer. <b>150</b> = SELLING_PRICE exactly 170. <b>300</b> = every other selling price. SIM_NO prevents double counting, and ACTIVATION_DATE must match the selected date.
            </div>
            {message && <div style={{ marginTop: 12, padding: 12, background: "#f2f4f7", borderRadius: 8 }}>{message}</div>}
          </section>
  ) : null;

  return (
    <main className="page modern-upload-page">
      <div className="modern-upload-head">
        <div>
          <a href="/admin/upload" style={{ color: "#475467" }}>← Upload Center</a>
          <h1 style={{ marginBottom: 4 }}>Daily GA Upload & SSO</h1>
          <p style={{ marginTop: 0, color: "#667085" }}>
            Upload the previous day&apos;s Activation Details report. Each unique SIM_NO is one GA.
          </p>
        </div>
        <div className="date-range-filter"><label>From<input type="date" value={fromDate} onChange={e=>changeFrom(e.target.value)}/></label><label>To<input type="date" value={toDate} min={fromDate} onChange={e=>setToDate(e.target.value)}/></label></div>
      </div>

{uploadPanel}

      <h2 style={{ marginBottom: 10 }}>Selected Day: {dataDate}</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14, marginBottom: 18 }}>
        <Stat name="Total" value={dayTotals.total.toLocaleString()} note="All SIM activations" />
        <Stat name="150" value={dayTotals.ga150.toLocaleString()} note="Selling price = 170" />
        <Stat name="300" value={dayTotals.ga300.toLocaleString()} note="Selling price ≠ 170" />
        <Stat name="Active Retailers" value={retailerDaily.length.toLocaleString()} note="Retailers with GA that day" />
      </div>

      <section style={panel}>
        <h2 style={{ marginTop: 0 }}>Retailer GA</h2>
        {retailerDaily.length === 0 ? (
          <p style={{ color: "#667085" }}>No GA data stored for {dataDate}.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead><tr><th>Supervisor</th><th>Employee</th><th>Retailer Code</th><th>Retailer Name</th><th>Total</th><th>150</th><th>300</th></tr></thead>
              <tbody>
                {retailerDaily.map((r) => (
                  <tr key={r.retailerCode}>
                    <td>{r.supervisor}</td>
                    <td><b>{r.employee}</b><br /><small>{r.rsoMsisdn}</small></td>
                    <td><b>{r.retailerCode}</b></td>
                    <td>{r.retailerName}</td>
                    <td><b>{r.total}</b></td>
                    <td>{r.ga150}</td>
                    <td>{r.ga300}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <h2 style={{ marginBottom: 10, marginTop: 24 }}>Monthly Employee Performance</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14, marginBottom: 18 }}>
        <Stat name="GA Target" value={totals.target.toLocaleString()} />
        <Stat name="GA Achieved" value={totals.achieved.toLocaleString()} />
        <Stat name="150" value={totals.ga150.toLocaleString()} />
        <Stat name="300" value={totals.ga300.toLocaleString()} />
        <Stat name="GA %" value={totals.target ? `${((totals.achieved / totals.target) * 100).toFixed(1)}%` : "0%"} />
        <Stat name="SSO" value={`${totals.ssoA.toLocaleString()} / ${totals.ssoT.toLocaleString()}`} />
      </div>

      <section style={panel}>
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead><tr><th>Supervisor</th><th>Employee</th><th>Retailers</th><th>150</th><th>300</th><th>GA Target</th><th>GA Achieved</th><th>GA %</th><th>SSO Target</th><th>SSO Achieved</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.employeeId}>
                  <td>{r.supervisor}</td>
                  <td><b>{r.name}</b><br /><small>{r.employeeCode || r.rsoMsisdn}</small></td>
                  <td>{r.retailerCount}</td>
                  <td>{r.ga150}</td>
                  <td>{r.ga300}</td>
                  <td>{r.gaTarget}</td>
                  <td><b>{r.gaAchieved}</b></td>
                  <td>{r.gaPercent}%</td>
                  <td>{r.ssoTarget}</td>
                  <td><b>{r.ssoAchieved}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ ...panel, marginTop: 18 }}>
        <h2 style={{ marginTop: 0 }}>Recent GA Imports</h2>
        {history.length === 0 ? <p style={{ color: "#667085" }}>No GA file imported yet.</p> : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead><tr><th>Data Date</th><th>File</th><th>Uploaded</th><th>Saved / Total</th><th>Duplicates</th><th>Failed</th><th>Status</th></tr></thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td>{prettyDate(h.businessDate)}</td>
                    <td>{h.fileName}</td>
                    <td>{new Date(h.uploadedAt).toLocaleString()}</td>
                    <td>{h.successRows}/{h.totalRows}</td>
                    <td>{h.duplicateRows}</td>
                    <td>{h.failedRows}</td>
                    <td>{h.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function Stat({ name, value, note }: { name: string; value: string; note?: string }) {
  return <div style={{ ...panel, margin: 0 }}><div style={{ color: "#667085", fontSize: 13 }}>{name}</div><div style={{ fontSize: 28, fontWeight: 800, marginTop: 7 }}>{value}</div>{note && <div style={{ color: "#98a2b3", fontSize: 12, marginTop: 3 }}>{note}</div>}</div>;
}

const panel: React.CSSProperties = { background: "white", border: "1px solid #e4e7ec", borderRadius: 14, padding: 18 };
const inputStyle: React.CSSProperties = { padding: "9px 10px", border: "1px solid #d0d5dd", borderRadius: 8, marginTop: 4 };
const button: React.CSSProperties = { padding: "10px 16px", borderRadius: 8, border: 0, background: "#101828", color: "white", fontWeight: 700, cursor: "pointer" };
const ruleBox: React.CSSProperties = { marginTop: 16, padding: 13, background: "#f8fafc", border: "1px solid #e4e7ec", borderRadius: 10, color: "#475467", lineHeight: 1.6 };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };


const uploadTitleRow:React.CSSProperties={display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap",marginBottom:14};
const sampleLink:React.CSSProperties={display:"inline-flex",alignItems:"center",minHeight:38,padding:"0 12px",borderRadius:9,border:"1px solid #d0d5dd",background:"#fff",color:"#344054",fontWeight:700,fontSize:12,textDecoration:"none"};