import Link from "next/link";
import {PageHead,ProgressCard} from "./RoleUI";
import {StatStrip} from "./DrillUI";

const money=(n:number)=>`৳${Math.round(n).toLocaleString()}`;
export function RetailerDetailView({d,month,backHref}:{d:any;month:string;backHref:string}){
 const r=d.retailer,simSeller=(r.simSeller||"").toUpperCase()==="Y";
 const recharge=[...d.c2c.map((x:any)=>({type:"C2C",date:x.date,amount:Number(x.amount)})),...d.c2s.map((x:any)=>({type:"C2S",date:x.date,amount:Number(x.amount)}))].sort((a:any,b:any)=>b.date.getTime()-a.date.getTime()).slice(0,24);
 return <main className="page retailer-profile-v2">
  <section className="retailer-profile-hero">
   <div className="retailer-profile-back"><Link href={backHref}>‹ Back</Link><span>{month}</span></div>
   <div className="retailer-profile-main"><div className="retailer-profile-avatar">{(r.retailerName||r.retailerCode).slice(0,2).toUpperCase()}</div><div><div className="admin-kicker">RETAILER PROFILE</div><h1>{r.retailerName||r.retailerCode}</h1><p>{r.retailerCode} · {r.route||"No route"} · {r.category||"No category"}</p><div className="retailer-profile-badges"><span className={simSeller?"good":""}>{simSeller?"SIM Seller":"Regular Retailer"}</span><span className={d.bp?"bp":""}>{d.bp?"Active BP":"Normal Outlet"}</span></div></div></div>
   <div className="retailer-owner-strip"><div><span>RSO</span><strong>{r.employee?.name||"Unassigned"}</strong></div><div><span>Supervisor</span><strong>{r.employee?.supervisor?.name||"—"}</strong></div><div><span>RSO MSISDN</span><strong>{r.employee?.rsoMsisdn||r.iTopUpSrNumber||"—"}</strong></div><div><span>iTopUp</span><strong>{r.iTopUpNumber||"—"}</strong></div></div>
  </section>

  <section className="retailer-v2-kpis">
   <ProfileKpi label="GA Total" value={d.gaTotal} sub={`${d.ga150} × 170 · ${d.ga300} × 300`} tone="blue"/>
   <ProfileKpi label="SIM Swap" value={d.simSwap} sub="Replacement · not in GA" tone="amber"/>
   <ProfileKpi label="C2C" value={money(d.c2cAmount)} sub={`${d.c2cTrx} transactions`} tone="violet"/>
   <ProfileKpi label="C2S" value={money(d.c2sAmount)} sub={`${d.c2sTrx} transactions`} tone="cyan"/>
   <ProfileKpi label="Opening Balance" value={d.ob?money(Number(d.ob.amount)):"—"} sub="Latest snapshot" tone="green"/>
  </section>

  <section className="retailer-status-grid">
   <article className={`retailer-status-card ${d.ssoComplete?"done":"pending"}`}><span>SSO STATUS</span><strong>{simSeller?(d.ssoComplete?"Completed":"Pending"):"Not applicable"}</strong><small>{simSeller?`${d.gaTotal} standard GA in selected range`:"Retailer is not marked SIM seller"}</small></article>
   <article className={`retailer-status-card ${d.lsoComplete?"done":"pending"}`}><span>LSO STATUS</span><strong>{d.lsoComplete?"Completed":"Pending"}</strong><small>{money(d.c2sAmount)} · {d.c2sTrx} transactions</small></article>
  </section>

  <section className="retailer-v2-grid">
   <div className="retailer-v2-panel"><div className="retailer-v2-panel-head"><div><span>ACTIVATIONS</span><h2>Recent GA</h2></div><b>{d.gaTotal}</b></div><div className="retailer-activity-v2">{d.ga.length?d.ga.slice(0,20).map((x:any)=><div className="retailer-activity-row" key={x.simNo}><span className={`activity-type ${x.category==="SIM_SWAP"?"swap":"sim"}`}>{x.category==="SIM_SWAP"?"SWAP":"SIM"}</span><div><strong>{x.simNo}</strong><small>{x.activationDate.toISOString().slice(0,10)}{x.activationTime?` · ${x.activationTime}`:""}</small></div><div><strong>৳{Number(x.sellingPrice)}</strong><small>{gaRowLabel(x)}</small></div></div>):<div className="empty">No GA in this period.</div>}</div></div>
   <div className="retailer-v2-panel"><div className="retailer-v2-panel-head"><div><span>RECHARGE</span><h2>Recent activity</h2></div><b>{recharge.length}</b></div><div className="retailer-activity-v2">{recharge.length?recharge.map((x:any,idx:number)=><div className="retailer-activity-row" key={`${x.type}-${x.date}-${idx}`}><span className={`activity-type ${x.type.toLowerCase()}`}>{x.type}</span><div><strong>{x.type} transaction</strong><small>{x.date.toISOString().slice(0,10)} · daily amount</small></div><div><strong>{money(x.amount)}</strong></div></div>):<div className="empty">No recharge activity in this period.</div>}</div></div>
  </section>
 </main>
}
function ProfileKpi({label,value,sub,tone}:{label:string;value:string|number;sub:string;tone:string}){return <article className={`retailer-profile-kpi tone-${tone}`}><span>{label}</span><strong>{value}</strong><small>{sub}</small></article>}

function gaRowLabel(row:{category?:string;productCode?:string|null}){
 if(row.category==="SIM_SWAP")return row.productCode||"Replacement";
 if(row.category==="GA_170")return "170 pack";
 if(row.category==="GA_300")return "300 pack";
 return row.productCode||"Not counted";
}
