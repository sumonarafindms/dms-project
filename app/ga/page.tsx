"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {useCan} from "../components/PermissionContext";
import {dhakaYesterdayYmd} from "../../lib/business-time";

type EmployeeRow = {
  employeeId: string;
  employeeCode?: string | null;
  name: string;
  rsoMsisdn: string;
  supervisor: string;
  retailerCount: number;
  ga150: number;
  ga300: number;
  simSwap: number;
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
  simSwap: number;
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

function yesterday(){return dhakaYesterdayYmd()}

function prettyDate(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
}

export default function GaPage() {
  const canView=useCan("ga","view");
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
      simSwap: a.simSwap + r.simSwap,
      ssoT: a.ssoT + r.ssoTarget,
      ssoA: a.ssoA + r.ssoAchieved,
    }),
    { target: 0, achieved: 0, ga150: 0, ga300: 0, simSwap:0, ssoT: 0, ssoA: 0 },
  ), [rows]);

  const dayTotals = useMemo(() => retailerDaily.reduce(
    (a, r) => ({ total: a.total + r.total, ga150: a.ga150 + r.ga150, ga300: a.ga300 + r.ga300, simSwap:a.simSwap+r.simSwap }),
    { total: 0, ga150: 0, ga300: 0, simSwap:0 },
  ), [retailerDaily]);

  const uploadPanel = canAdd ? (
    <section className="ga-upload-card">
      <div className="ga-upload-card-head">
        <div><span className="ga-section-icon">⇧</span><div><span className="ga-upload-overline">IMPORT WORKSPACE</span><h2>Upload Activation Details</h2><p>Import the selected day&apos;s activation workbook.</p></div></div>
        <a href="/api/samples/ga" className="ga-sample-btn">⇩ Download Sample File</a>
      </div>
      <div className="ga-upload-flow"><span><b>1</b> Select date</span><i>→</i><span><b>2</b> Choose file</span><i>→</i><span><b>3</b> Validate SIM</span><i>→</i><span><b>4</b> Save</span></div><form onSubmit={upload} className="ga-upload-form">
        <label><span>GA Data Date</span><input name="businessDate" type="date" value={dataDate} onChange={(e)=>changeDataDate(e.target.value)} required/></label>
        <label className="ga-file-field"><span>ActivationDetailsReport.xlsx</span><small>Excel · max 20 MB</small><input name="file" type="file" accept=".xlsx,.xlsm,.xls" required/></label>
        <button disabled={loading} className="ga-upload-btn">{loading?"Processing...":"⇧  Upload GA"}</button>
      </form>
      <div className="ga-rule-box"><span className="ga-info-dot">i</span><div><b>GA counting rule:</b> PRODUCT_CODE <b>MMST / MMSTs</b> = 300 SIM, <b>MMSTC</b> = 170 SIM. <b>SIMWAP / EV-SWAP</b> must also have <b>SELLING_PRICE 350</b>. They are counted only under <b>SIM SWAP</b> and are excluded from GA achievement, GA target progress and SSO. SIM_NO still prevents duplicate import.</div></div>
      {message&&<div className="ga-message">{message}</div>}
    </section>
  ) : null;

  if(!canView)return null;
  return (
    <main className="page ga-premium-page">
      <header className="ga-page-head">
        <div className="ga-head-copy">
          <a href="/admin/upload" className="ga-back-link">← Upload Center</a>
          <div className="ga-title-line"><h1>Daily GA Upload &amp; SSO</h1><span className="ga-title-badge">GA</span></div>
          <p>Upload the Activation Details report. Standard SIM sales count toward GA; replacement SIMs are tracked separately as SIM SWAP.</p>
        </div>
        <div className="ga-date-card">
          <label><span>FROM</span><input type="date" value={fromDate} onChange={e=>changeFrom(e.target.value)}/></label>
          <label><span>TO</span><input type="date" value={toDate} min={fromDate} onChange={e=>setToDate(e.target.value)}/></label>
        </div>
      </header>

      {uploadPanel}

      <section className="ga-section">
        <div className="ga-section-title"><span className="ga-section-icon">▣</span><div><h2>Selected Day: {prettyDate(dataDate)}</h2><p>Daily activation snapshot</p></div></div>
        <div className="ga-day-metrics">
          <Metric tone="blue" icon="⌁" name="Total" value={dayTotals.total.toLocaleString()} note="All SIM activations"/>
          <Metric tone="green" icon="150" name="150" value={dayTotals.ga150.toLocaleString()} note="Selling price = 170"/>
          <Metric tone="orange" icon="300" name="300" value={dayTotals.ga300.toLocaleString()} note="MMST / MMSTs"/>
          <Metric tone="rose" icon="↻" name="SIM SWAP" value={dayTotals.simSwap.toLocaleString()} note="SIMWAP / EV-SWAP · price 350 · excluded from GA"/>
          <Metric tone="purple" icon="●" name="Active Retailers" value={retailerDaily.length.toLocaleString()} note="Retailers with GA that day"/>
        </div>
      </section>

      <section className="ga-data-card">
        <div className="ga-card-head"><div className="ga-section-title"><span className="ga-section-icon">▤</span><div><h2>Retailer GA</h2><p>Retailer-wise activation for the selected day</p></div></div><span className="ga-count-pill">{retailerDaily.length} retailers</span></div>
        {retailerDaily.length===0?<div className="ga-empty"><span>▤</span><strong>No retailer GA yet</strong><p>No GA data stored for {prettyDate(dataDate)}.</p></div>:
        <PremiumTable><thead><tr><th>Supervisor</th><th>Employee</th><th>Retailer</th><th>Total GA</th><th>150</th><th>300</th><th>SIM SWAP</th></tr></thead><tbody>{retailerDaily.map(r=><tr key={r.retailerCode}><td><div className="ga-person"><span>{initials(r.supervisor)}</span><div><b>{r.supervisor}</b><small>Supervisor</small></div></div></td><td><div className="ga-person"><span>{initials(r.employee)}</span><div><b>{r.employee}</b><small>{r.rsoMsisdn}</small></div></div></td><td><b>{r.retailerCode}</b><small className="ga-subline">{r.retailerName}</small></td><td><strong className="ga-number blue">{r.total}</strong></td><td><span className="ga-number green">{r.ga150}</span></td><td><span className="ga-number orange">{r.ga300}</span></td><td><span className="ga-number swap">{r.simSwap}</span></td></tr>)}</tbody></PremiumTable>}
      </section>

      <section className="ga-section ga-performance-section">
        <div className="ga-section-title"><span className="ga-section-icon">↗</span><div><h2>Monthly Employee Performance</h2><p>Target achievement and SSO progress</p></div></div>
        <div className="ga-performance-metrics">
          <Metric tone="blue" name="GA Target" value={totals.target.toLocaleString()} note="Monthly target"/>
          <Metric tone="green" name="GA Achieved" value={totals.achieved.toLocaleString()} note="Completed GA"/>
          <Metric tone="cyan" name="150" value={totals.ga150.toLocaleString()} note="Price = 170"/>
          <Metric tone="orange" name="300" value={totals.ga300.toLocaleString()} note="MMST / MMSTs"/>
          <Metric tone="rose" name="SIM SWAP" value={totals.simSwap.toLocaleString()} note="Replacement only · not achievement"/>
          <Metric tone="purple" name="GA %" value={totals.target?`${((totals.achieved/totals.target)*100).toFixed(1)}%`:"0%"} note="Achievement rate"/>
          <Metric tone="rose" name="SSO" value={`${totals.ssoA.toLocaleString()} / ${totals.ssoT.toLocaleString()}`} note="Achieved / target"/>
        </div>
      </section>

      <section className="ga-data-card">
        <div className="ga-card-head"><div><h2>Employee Performance</h2><p>Monthly RSO performance overview</p></div><span className="ga-count-pill">{rows.length} employees</span></div>
        <PremiumTable><thead><tr><th>Supervisor</th><th>Employee</th><th>Retailers</th><th>150</th><th>300</th><th>SIM SWAP</th><th>GA Target</th><th>GA Achieved</th><th>GA Progress</th><th>SSO</th></tr></thead><tbody>{rows.map(r=><tr key={r.employeeId}><td><div className="ga-person"><span>{initials(r.supervisor)}</span><div><b>{r.supervisor}</b><small>Supervisor</small></div></div></td><td><div className="ga-person"><span>{initials(r.name)}</span><div><b>{r.name}</b><small>{r.employeeCode||r.rsoMsisdn}</small></div></div></td><td><span className="ga-neutral-pill">{r.retailerCount}</span></td><td><span className="ga-number green">{r.ga150}</span></td><td><span className="ga-number orange">{r.ga300}</span></td><td><span className="ga-number swap">{r.simSwap}</span></td><td>{r.gaTarget}</td><td><strong className="ga-number blue">{r.gaAchieved}</strong></td><td><div className="ga-progress-cell"><div><span style={{width:`${Math.min(100,r.gaPercent)}%`}}/></div><b>{r.gaPercent}%</b></div></td><td><div className="ga-sso-cell"><b>{r.ssoAchieved}</b><span>/ {r.ssoTarget}</span></div></td></tr>)}</tbody></PremiumTable>
      </section>

      <section className="ga-data-card ga-history-card">
        <div className="ga-card-head"><div><h2>Recent GA Imports</h2><p>Latest activation files and import results</p></div><span className="ga-count-pill">{history.length} imports</span></div>
        {history.length===0?<div className="ga-empty"><span>⇧</span><strong>No imports yet</strong><p>Your recent GA uploads will appear here.</p></div>:
        <PremiumTable><thead><tr><th>Data Date</th><th>File</th><th>Uploaded</th><th>Saved / Total</th><th>Duplicates</th><th>Failed</th><th>Status</th></tr></thead><tbody>{history.map(h=><tr key={h.id}><td><b>{prettyDate(h.businessDate)}</b></td><td>{h.fileName}</td><td>{new Date(h.uploadedAt).toLocaleString()}</td><td><strong className="ga-number blue">{h.successRows}/{h.totalRows}</strong></td><td>{h.duplicateRows}</td><td>{h.failedRows}</td><td><span className={`ga-status ${h.status.toLowerCase()}`}>{h.status}</span></td></tr>)}</tbody></PremiumTable>}
      </section>
    </main>
  );
}

function initials(value:string){return (value||"?").trim().split(/\s+/).slice(0,2).map(v=>v[0]).join("").toUpperCase()}
function Metric({tone,icon,name,value,note}:{tone:string;icon?:string;name:string;value:string;note?:string}){
 return <article className={`ga-metric tone-${tone}`}><span className="ga-metric-icon">{icon||"•"}</span><div><span className="ga-metric-label">{name}</span><strong>{value}</strong>{note&&<small>{note}</small>}</div></article>
}
function PremiumTable({children}:{children:React.ReactNode}){return <div className="ga-table-shell"><div className="ga-table-scroll"><table className="ga-premium-table">{children}</table></div></div>}
