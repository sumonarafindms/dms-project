"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {useCan} from "../components/PermissionContext";

type Row = {
  employeeId: string; employeeCode?: string | null; name: string; rsoMsisdn: string; supervisor: string; retailerCount: number;
  transactionCount: number; c2cTarget: number; c2cAchieved: number; c2cPercent: number; scAchieved: number;
  totalRechargeTarget: number; totalRechargeAchieved: number; totalRechargePercent: number; reportEndDate?: string | null;
};
type DailyRow = { retailerCode: string; retailerName: string; employee: string; rsoMsisdn: string; supervisor: string; amount: number };
type History = { id: string; fileName: string; uploadedAt: string; businessDate?: string | null; totalRows: number; successRows: number; failedRows: number; status: string };

function todayYmd() { return new Date().toISOString().slice(0, 10); }
function money(n: number) { return new Intl.NumberFormat("en-BD", { maximumFractionDigits: 2 }).format(n); }

export default function C2cPage() {
  const canAdd=useCan("c2c","add");
  const [month, setMonth] = useState(() => todayYmd().slice(0, 7));
  const [date, setDate] = useState(() => todayYmd());
  const [fromDate,setFromDate]=useState(()=>`${todayYmd().slice(0,7)}-01`);
  const [toDate,setToDate]=useState(()=>todayYmd());
  const [rows, setRows] = useState<Row[]>([]);
  const [dailyRows, setDailyRows] = useState<DailyRow[]>([]);
  const [history, setHistory] = useState<History[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    const p = new URLSearchParams({ month: `${month}-01`, date,from:fromDate,to:toDate });
    const res = await fetch(`/api/c2c/summary?${p}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) return setMessage(data.error || "Failed to load C2C data");
    setRows(data.rows || []); setDailyRows(data.dailyRows || []); setHistory(data.importHistory || []);
  }
  useEffect(() => { load(); }, [month, date,fromDate,toDate]);

  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem("file") as HTMLInputElement;
    if (!input.files?.[0]) return;
    setLoading(true); setMessage("Reading month-to-date C2C report and updating date-wise balances...");
    const body = new FormData(); body.append("file", input.files[0]);
    const res = await fetch("/api/import/C2C", { method: "POST", body });
    const data = await res.json(); setLoading(false);
    if (!res.ok) return setMessage(data.error || "C2C import failed");
    if (data.duplicate) setMessage(`This exact C2C file was already imported. Nothing was counted twice.`);
    else {
      setMessage(`C2C updated ${data.reportStartDate} → ${data.reportEndDate}. ${data.successRows} retailers mapped, ${data.failedRows} failed, ${data.dailyRecordsStored} non-zero daily balance records stored.${data.assignmentWarnings ? ` ${data.assignmentWarnings} RSO assignment mismatch warning(s).` : ""}`);
      if (data.reportEndDate) { setDate(data.reportEndDate); setMonth(data.reportEndDate.slice(0, 7)); }
    }
    input.value = ""; await load();
  }

  const totals = useMemo(() => rows.reduce((a, r) => ({ c2cT: a.c2cT+r.c2cTarget, c2cA: a.c2cA+r.c2cAchieved, sc: a.sc+r.scAchieved, trT: a.trT+r.totalRechargeTarget, trA: a.trA+r.totalRechargeAchieved, trx: a.trx+r.transactionCount }), { c2cT:0,c2cA:0,sc:0,trT:0,trA:0,trx:0 }), [rows]);
  const dayTotal = useMemo(() => dailyRows.reduce((s, r) => s+r.amount, 0), [dailyRows]);

  return <main className="page modern-upload-page">
    <div className="modern-upload-head">
      <div><a href="/admin/upload" style={{color:"#475467"}}>← Upload Center</a><h1 style={{marginBottom:4}}>C2C Recharge Balance</h1><p style={{marginTop:0,color:"#667085"}}>Upload the cumulative month-to-date Stock Lifting report. Date columns are stored separately, so repeated uploads never add the same day twice.</p></div>
      <div className="date-range-filter"><label>From<input type="date" value={fromDate} onChange={e=>{setFromDate(e.target.value);setMonth(e.target.value.slice(0,7));if(toDate<e.target.value)setToDate(e.target.value)}}/></label><label>To<input type="date" min={fromDate} value={toDate} onChange={e=>setToDate(e.target.value)}/></label></div>
    </div>

{canAdd&&    <section className="card modern-upload-panel"><div style={uploadTitleRow}><h2 style={{margin:0}}>Upload C2C File</h2><a href="/api/samples/c2c" style={sampleLink}>Download Sample File</a></div>
      <form onSubmit={upload} style={{display:"flex",gap:14,flexWrap:"wrap",alignItems:"end"}}><label>ITop_Up_StockLifting file<br/><input name="file" type="file" accept=".xls,.xlsx,.xlsm,.txt" required style={{marginTop:10}}/></label><button disabled={loading} style={button}>{loading?"Processing...":"Upload C2C"}</button></form>
      <div style={ruleBox}><b>How it works:</b> RETAILER_CODE maps the outlet. SRNUMBER is checked against the employee/RSO relationship. TRANSACTION_COUNT and TOTAL_AMOUNT are kept as the latest month-to-date retailer totals. Each header such as 01-Aug-2026 is stored as that retailer&apos;s amount for that exact date. Zero daily rows are not stored, which keeps the database small.</div>
      {message && <div style={{marginTop:12,padding:12,background:"#f2f4f7",borderRadius:8}}>{message}</div>}
    </section>

}    <h2 style={{marginBottom:10,marginTop:24}}>Monthly Employee Performance</h2>
    <div style={stats}><Stat name="C2C Target" value={money(totals.c2cT)}/><Stat name="C2C Achieved" value={money(totals.c2cA)}/><Stat name="C2C %" value={totals.c2cT?`${((totals.c2cA/totals.c2cT)*100).toFixed(1)}%`:"0%"}/><Stat name="SC Achieved" value={money(totals.sc)}/><Stat name="Total Recharge" value={money(totals.trA)} note="C2C + SC"/><Stat name="Transactions" value={totals.trx.toLocaleString()} note="Latest month-to-date count"/></div>
    <section style={panel}><div style={{overflowX:"auto"}}><table style={tableStyle}><thead><tr><th>Supervisor</th><th>Employee</th><th>Retailers</th><th>Transactions</th><th>C2C Target</th><th>C2C Achieved</th><th>C2C %</th><th>SC</th><th>Total Recharge Target</th><th>Total Recharge Achieved</th><th>%</th></tr></thead><tbody>{rows.map(r=><tr key={r.employeeId}><td>{r.supervisor}</td><td><b>{r.name}</b><br/><small>{r.employeeCode||r.rsoMsisdn}</small></td><td>{r.retailerCount}</td><td>{r.transactionCount}</td><td>{money(r.c2cTarget)}</td><td><b>{money(r.c2cAchieved)}</b></td><td>{r.c2cPercent}%</td><td>{money(r.scAchieved)}</td><td>{money(r.totalRechargeTarget)}</td><td><b>{money(r.totalRechargeAchieved)}</b></td><td>{r.totalRechargePercent}%</td></tr>)}</tbody></table></div></section>

    <div style={{display:"flex",justifyContent:"space-between",alignItems:"end",flexWrap:"wrap",gap:12,marginTop:24}}><h2 style={{marginBottom:0}}>Date-wise C2C</h2><label>View Date<br/><input type="date" value={date} onChange={e=>{setDate(e.target.value); if(e.target.value) setMonth(e.target.value.slice(0,7));}} style={inputStyle}/></label></div>
    <div style={{...stats,marginTop:12}}><Stat name="Selected Day Amount" value={money(dayTotal)}/><Stat name="Retailers Receiving Balance" value={dailyRows.length.toLocaleString()}/></div>
    <section style={panel}>{dailyRows.length===0?<p style={{color:"#667085"}}>No C2C amount stored for {date}.</p>:<div style={{overflowX:"auto"}}><table style={tableStyle}><thead><tr><th>Supervisor</th><th>Employee</th><th>Retailer Code</th><th>Retailer Name</th><th>Amount</th></tr></thead><tbody>{dailyRows.map(r=><tr key={r.retailerCode}><td>{r.supervisor}</td><td><b>{r.employee}</b><br/><small>{r.rsoMsisdn}</small></td><td><b>{r.retailerCode}</b></td><td>{r.retailerName}</td><td><b>{money(r.amount)}</b></td></tr>)}</tbody></table></div>}</section>

    <section style={{...panel,marginTop:18}}><h2 style={{marginTop:0}}>Recent C2C Imports</h2>{history.length===0?<p style={{color:"#667085"}}>No C2C file imported yet.</p>:<div style={{overflowX:"auto"}}><table style={tableStyle}><thead><tr><th>Report End</th><th>File</th><th>Uploaded</th><th>Mapped / Total</th><th>Failed</th><th>Status</th></tr></thead><tbody>{history.map(h=><tr key={h.id}><td>{h.businessDate?new Date(h.businessDate).toLocaleDateString():"-"}</td><td>{h.fileName}</td><td>{new Date(h.uploadedAt).toLocaleString()}</td><td>{h.successRows}/{h.totalRows}</td><td>{h.failedRows}</td><td>{h.status}</td></tr>)}</tbody></table></div>}</section>
  </main>;
}
function Stat({name,value,note}:{name:string;value:string;note?:string}){return <div style={{...panel,margin:0}}><div style={{color:"#667085",fontSize:13}}>{name}</div><div style={{fontSize:26,fontWeight:800,marginTop:7}}>{value}</div>{note&&<div style={{color:"#98a2b3",fontSize:12,marginTop:3}}>{note}</div>}</div>}
const panel:React.CSSProperties={background:"white",border:"1px solid #e4e7ec",borderRadius:14,padding:18};
const stats:React.CSSProperties={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:14,marginBottom:18};
const inputStyle:React.CSSProperties={padding:"9px 10px",border:"1px solid #d0d5dd",borderRadius:8,marginTop:4};
const button:React.CSSProperties={padding:"10px 16px",borderRadius:8,border:0,background:"#101828",color:"white",fontWeight:700,cursor:"pointer"};
const ruleBox:React.CSSProperties={marginTop:16,padding:13,background:"#f8fafc",border:"1px solid #e4e7ec",borderRadius:10,color:"#475467",lineHeight:1.6};
const tableStyle:React.CSSProperties={width:"100%",borderCollapse:"collapse"};


const uploadTitleRow:React.CSSProperties={display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap",marginBottom:14};
const sampleLink:React.CSSProperties={display:"inline-flex",alignItems:"center",minHeight:38,padding:"0 12px",borderRadius:9,border:"1px solid #d0d5dd",background:"#fff",color:"#344054",fontWeight:700,fontSize:12,textDecoration:"none"};