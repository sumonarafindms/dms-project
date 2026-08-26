"use client";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {useCan} from "../components/PermissionContext";
import {OpsHeader,OpsUpload,OpsSectionTitle,OpsMetric,OpsDataCard,OpsTable,PersonCell,EmptyState} from "../components/OperationsPremiumUI";
import {TableScrollHint} from "../components/TableScrollHint";

type Row={retailerCode:string;retailerName:string;employee:string;rsoMsisdn:string;supervisor:string;amount:number};
type Batch={fileName:string;uploadedAt:string;businessDate?:string|null;totalRows:number;successRows:number;failedRows:number;status:string}|null;
function money(n:number){return new Intl.NumberFormat("en-BD",{maximumFractionDigits:2}).format(n)}
export default function ObPage(){
  const canView=useCan("ob","view");
  const canAdd=useCan("ob","add");
  const [rows,setRows]=useState<Row[]>([]);const [batch,setBatch]=useState<Batch>(null);const [snapshotDate,setSnapshotDate]=useState<string|null>(null);const [loading,setLoading]=useState(false);const [message,setMessage]=useState("");
  const [page,setPage]=useState(1);const [pageMeta,setPageMeta]=useState({page:1,pageSize:50,total:0,totalPages:1,hasNext:false,hasPrevious:false});const [totalBalance,setTotalBalance]=useState(0);
  async function load(nextPage=page){const res=await fetch(`/api/ob/summary?page=${nextPage}&pageSize=50`,{cache:"no-store"});const d=await res.json();if(!res.ok)return setMessage(d.error||"Failed to load OB");setRows(d.rows||[]);setBatch(d.batch||null);setSnapshotDate(d.snapshotDate||null);setPageMeta(d.pagination||{page:1,pageSize:50,total:d.retailerCount||0,totalPages:1,hasNext:false,hasPrevious:false});setTotalBalance(Number(d.totalOpeningBalance||0))}
  useEffect(()=>{void load(page)},[page]);
  async function upload(e:FormEvent<HTMLFormElement>){e.preventDefault();const input=e.currentTarget.elements.namedItem("file") as HTMLInputElement;if(!input.files?.[0])return;setLoading(true);setMessage("Replacing current Opening Balance snapshot...");const body=new FormData();body.append("file",input.files[0]);const res=await fetch("/api/import/OB",{method:"POST",body});const d=await res.json();setLoading(false);if(!res.ok)return setMessage(d.error||"OB import failed");setMessage(`Opening Balance replaced for ${d.snapshotDate}. ${d.successRows} retailers mapped, ${d.failedRows} failed. Current total balance: ${money(d.totalOpeningBalance)}.${d.assignmentWarnings?` ${d.assignmentWarnings} RSO assignment warning(s).`:""}`);input.value="";await load()}
  const total=useMemo(()=>totalBalance,[totalBalance]);
  if(!canView)return null;
  return <main className="page ops-premium-page">
    <OpsHeader badge="OB" title="Opening Balance" subtitle="Maintain the latest retailer opening-balance snapshot with a clean replacement workflow."/>

    {canAdd&&<OpsUpload title="Upload Latest OB File" subtitle="Replace the current retailer balance snapshot." sample="/api/samples/ob" message={message} rule={<>The report date is read from row 1. Only the latest retailer opening-balance snapshot is kept, and the previous snapshot is replaced after a successful import.</>}>
      <form onSubmit={upload} className="ops-upload-form"><label className="ops-file-field"><span>ITop_Up_Balance file</span><small>Excel / TXT · max 20 MB</small><input name="file" type="file" accept=".xls,.xlsx,.xlsm,.txt" required/></label><button disabled={loading} className="ops-upload-btn">{loading?"Replacing...":"⇧  Upload & Replace OB"}</button></form>
    </OpsUpload>}

    <section className="ops-section"><OpsSectionTitle title="Current Balance Snapshot" subtitle="Latest stored opening balance across your retailer base." icon="◫"/>
      <div className="ops-metrics-grid four"><OpsMetric tone="blue" label="Snapshot Date" value={snapshotDate||"No data"} note="Latest report date"/><OpsMetric tone="purple" label="Retailers" value={pageMeta.total.toLocaleString()} note="Mapped outlets"/><OpsMetric tone="green" label="Total Opening Balance" value={money(total)} note="Current total balance"/><OpsMetric tone="orange" label="Last Import" value={batch?new Date(batch.uploadedAt).toLocaleDateString():"-"} note={batch?new Date(batch.uploadedAt).toLocaleTimeString():"No import yet"}/></div>
    </section>

    <OpsDataCard title="Retailer Opening Balance" subtitle="Latest balance by retailer and responsible field employee." count={`${pageMeta.total} retailers`}>
      {rows.length?<OpsTable><thead><tr><th>Supervisor</th><th>Employee</th><th>Retailer</th><th>Opening Balance</th></tr></thead><tbody>{rows.map(r=><tr key={r.retailerCode}><td><PersonCell name={r.supervisor}/></td><td><PersonCell name={r.employee} sub={r.rsoMsisdn}/></td><td><b>{r.retailerCode}</b><small className="ops-subline">{r.retailerName}</small></td><td><strong className="ops-number green">৳{money(r.amount)}</strong></td></tr>)}</tbody></OpsTable>:<EmptyState title="No opening balance yet" subtitle="Upload the latest OB file to populate retailer balances." icon="◫"/>}
      {pageMeta.totalPages>1&&<div className="pagination-v83" aria-label="Opening Balance pages"><button type="button" disabled={!pageMeta.hasPrevious} onClick={()=>setPage(p=>Math.max(1,p-1))}>Previous</button><span>Page {pageMeta.page} of {pageMeta.totalPages}</span><button type="button" disabled={!pageMeta.hasNext} onClick={()=>setPage(p=>p+1)}>Next</button></div>}
    </OpsDataCard>
  </main>
}
