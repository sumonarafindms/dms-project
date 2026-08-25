"use client";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {useCan} from "../components/PermissionContext";

type Row={retailerCode:string;retailerName:string;employee:string;rsoMsisdn:string;supervisor:string;amount:number};
type Batch={fileName:string;uploadedAt:string;businessDate?:string|null;totalRows:number;successRows:number;failedRows:number;status:string}|null;
function money(n:number){return new Intl.NumberFormat("en-BD",{maximumFractionDigits:2}).format(n)}
export default function ObPage(){
  const canAdd=useCan("ob","add");
  const [rows,setRows]=useState<Row[]>([]);const [batch,setBatch]=useState<Batch>(null);const [snapshotDate,setSnapshotDate]=useState<string|null>(null);const [loading,setLoading]=useState(false);const [message,setMessage]=useState("");
  async function load(){const res=await fetch("/api/ob/summary",{cache:"no-store"});const d=await res.json();if(!res.ok)return setMessage(d.error||"Failed to load OB");setRows(d.rows||[]);setBatch(d.batch||null);setSnapshotDate(d.snapshotDate||null)}
  useEffect(()=>{load()},[]);
  async function upload(e:FormEvent<HTMLFormElement>){e.preventDefault();const input=e.currentTarget.elements.namedItem("file") as HTMLInputElement;if(!input.files?.[0])return;setLoading(true);setMessage("Replacing current Opening Balance snapshot...");const body=new FormData();body.append("file",input.files[0]);const res=await fetch("/api/import/OB",{method:"POST",body});const d=await res.json();setLoading(false);if(!res.ok)return setMessage(d.error||"OB import failed");setMessage(`Opening Balance replaced for ${d.snapshotDate}. ${d.successRows} retailers mapped, ${d.failedRows} failed. Current total balance: ${money(d.totalOpeningBalance)}.${d.assignmentWarnings?` ${d.assignmentWarnings} RSO assignment warning(s).`:""}`);input.value="";await load()}
  const total=useMemo(()=>rows.reduce((s,r)=>s+r.amount,0),[rows]);
  return <main className="page modern-upload-page"><a href="/admin/upload" style={{color:"#475467"}}>← Upload Center</a><h1 style={{marginBottom:4}}>Opening Balance</h1><p style={{marginTop:0,color:"#667085"}}>Latest snapshot only. Every new OB upload fully replaces the previous retailer balances, so no daily OB history accumulates.</p>
{canAdd&&    <section className="card modern-upload-panel"><div style={uploadTitleRow}><h2 style={{margin:0}}>Upload Latest OB File</h2><a href="/api/samples/ob" style={sampleLink}>Download Sample File</a></div><form onSubmit={upload} style={{display:"flex",gap:14,flexWrap:"wrap",alignItems:"end"}}><label>ITop_Up_Balance file<br/><input name="file" type="file" accept=".xls,.xlsx,.xlsm,.txt" required style={{marginTop:10}}/></label><button disabled={loading} style={button}>{loading?"Replacing...":"Upload & Replace OB"}</button></form><div style={ruleBox}>The date is read automatically from row 1. Only the latest retailer opening-balance snapshot is kept. The uploaded file itself is not stored, and previous OB records/import history are removed when a new snapshot succeeds.</div>{message&&<div style={{marginTop:12,padding:12,background:"#f2f4f7",borderRadius:8}}>{message}</div>}</section>
}    <div style={stats}><Stat name="Snapshot Date" value={snapshotDate||"No data"}/><Stat name="Retailers" value={rows.length.toLocaleString()}/><Stat name="Total Opening Balance" value={money(total)}/><Stat name="Last Import" value={batch?new Date(batch.uploadedAt).toLocaleString():"-"}/></div>
    <section style={panel}>{rows.length===0?<p style={{color:"#667085"}}>No Opening Balance uploaded yet.</p>:<div style={{overflowX:"auto"}}><table style={table}><thead><tr><th>Supervisor</th><th>Employee</th><th>Retailer Code</th><th>Retailer Name</th><th>Opening Balance</th></tr></thead><tbody>{rows.map(r=><tr key={r.retailerCode}><td>{r.supervisor}</td><td><b>{r.employee}</b><br/><small>{r.rsoMsisdn}</small></td><td><b>{r.retailerCode}</b></td><td>{r.retailerName}</td><td><b>{money(r.amount)}</b></td></tr>)}</tbody></table></div>}</section>
  </main>
}
function Stat({name,value}:{name:string;value:string}){return <div style={{...panel,margin:0}}><div style={{color:"#667085",fontSize:13}}>{name}</div><div style={{fontSize:24,fontWeight:800,marginTop:7}}>{value}</div></div>}
const panel:React.CSSProperties={background:"white",border:"1px solid #e4e7ec",borderRadius:14,padding:18,marginTop:18};
const stats:React.CSSProperties={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:14,margin:"18px 0"};
const button:React.CSSProperties={padding:"10px 16px",borderRadius:8,border:0,background:"#101828",color:"white",fontWeight:700,cursor:"pointer"};
const ruleBox:React.CSSProperties={marginTop:16,padding:13,background:"#f8fafc",border:"1px solid #e4e7ec",borderRadius:10,color:"#475467",lineHeight:1.6};
const table:React.CSSProperties={width:"100%",borderCollapse:"collapse"};


const uploadTitleRow:React.CSSProperties={display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap",marginBottom:14};
const sampleLink:React.CSSProperties={display:"inline-flex",alignItems:"center",minHeight:38,padding:"0 12px",borderRadius:9,border:"1px solid #d0d5dd",background:"#fff",color:"#344054",fontWeight:700,fontSize:12,textDecoration:"none"};