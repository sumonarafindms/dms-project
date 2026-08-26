"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {useCan} from "../../../components/PermissionContext";
import {PremiumFeedback} from "../../../components/PremiumFeedback";
type Summary={retailers:number;mappedRetailers:number;unassignedRetailers:number};
export default function Page(){
 const canView=useCan("retailers","view"),canAdd=useCan("retailers","add");
 const [file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[result,setResult]=useState<any>(null),[summary,setSummary]=useState<Summary>({retailers:0,mappedRetailers:0,unassignedRetailers:0});
 async function refresh(){const r=await fetch("/api/master/summary",{cache:"no-store"});if(r.ok){const d=await r.json();setSummary(d)}}
 useEffect(()=>{refresh()},[]);
 async function upload(){if(!file)return;setBusy(true);setMessage("Validating retailer file and comparing it with current master data...");setResult(null);const form=new FormData();form.append("file",file);const r=await fetch("/api/master/import/retailers",{method:"POST",body:form});const d=await r.json();setBusy(false);if(!r.ok){setMessage(d.error||"Retailer import failed");return}setResult(d);setMessage("Retailer import completed.");setFile(null);await refresh()}
 if(!canView)return null;
 return <main className="page admin-upload-page"><div className="upload-page-head"><div><div className="admin-kicker">UPLOAD · RETAILER MASTER</div><h1>Retailer List</h1><p>Add new retailers or update existing retailer information using RETAILER_CODE as the unique key.</p></div><Link href="/admin/upload" className="btn btn-ghost">Back to Upload Center</Link></div>
 <div className="upload-top-stats"><div className="card"><span>Total Retailers</span><strong>{summary.retailers}</strong></div><div className="card"><span>Mapped</span><strong>{summary.mappedRetailers}</strong></div><div className="card"><span>Unassigned</span><strong>{summary.unassignedRetailers}</strong></div></div>
 {canAdd&&<section className="card admin-upload-box"><div className="upload-box-title"><div><strong>Upload Retailer List</strong><span>.xlsx, .xls or .xlsm</span></div><a href="/api/samples/retailers" className="btn upload-sample-btn">Download Sample File</a></div>
 <label className="upload-drop"><input type="file" accept=".xlsx,.xls,.xlsm" onChange={e=>setFile(e.target.files?.[0]||null)}/><b>{file?file.name:"Choose retailer Excel file"}</b><span>{file?"Ready for validation":"Tap to browse a file from your device"}</span></label>
 <button onClick={upload} disabled={!file||busy} className="btn admin-primary upload-process-btn">{busy?"Processing...":"Validate & Import"}</button>
 {message&&<PremiumFeedback message={message} tone={result?"success":/failed|invalid|missing|error/i.test(message)?"error":"info"}/>}
 {result&&<div className="upload-result-grid"><Result label="Total Rows" value={result.totalRows}/><Result label="New" value={result.newRows??0}/><Result label="Updated" value={result.updatedRows??0}/><Result label="Unchanged" value={result.unchangedRows??0}/><Result label="Mapped" value={result.mappedRows}/><Result label="Unassigned" value={result.unassignedRows}/><Result label="Invalid" value={result.failedRows}/></div>}
 </section>}
 <section className="section"><div className="card upload-format"><strong>Expected retailer fields</strong><div>{["RETAILER_CODE","RETAILER_NAME","SIM_SELLER","I_TOP_UP_SELLER","TRANMOBILENO","I_TOP_UP_SR_NUMBER","I_TOP_UP_NUMBER","CATEGORY","RSOCODE","ROUTE"].map(x=><code key={x}>{x}</code>)}</div><p>I_TOP_UP_SR_NUMBER is matched against the employee RSO MSISDN. Existing RETAILER_CODE values are updated instead of duplicated.</p></div></section>
 </main>
}
function Result({label,value}:{label:string;value:number}){return <div><span>{label}</span><strong>{Number(value||0).toLocaleString()}</strong></div>}
