import Link from "next/link";
import {FilterForm} from "./DrillUI";
import type {RetailerOpportunity} from "../../lib/retailer-opportunities";

const fmt=(n:number)=>new Intl.NumberFormat("en-BD",{maximumFractionDigits:0}).format(n);
export function RetailerSearchView({rows,month,q,base,attentionOnly=false}:{rows:RetailerOpportunity[];month:string;q:string;base:string;attentionOnly?:boolean}){
 const filtered=rows.filter(r=>{
   if(attentionOnly&&!r.reasons.length)return false;
   if(!q)return true;const x=q.toLowerCase();return `${r.retailerCode} ${r.retailerName} ${r.employeeName} ${r.supervisor} ${r.route} ${r.category}`.toLowerCase().includes(x);
 });
 return <><FilterForm q={q} month={month} placeholder="Retailer code, name, RSO, supervisor or route"/><section className="section"><div className="section-head"><h2 className="section-title">{attentionOnly?"Needs attention":"Retailers"}</h2><span className="section-link">{filtered.length} results</span></div><div className="card panel opportunity-list">{filtered.length?filtered.map(r=><Link key={r.id} href={`${base}/${r.id}?month=${month}`} className="opportunity-row"><div className="opportunity-main"><div className="opportunity-code">{r.retailerCode}</div><div className="person-name">{r.retailerName}</div><div className="person-meta">{r.employeeName} · {r.supervisor} · {r.route}</div><div className="chip-row"><span className={`status-pill ${r.ssoComplete?"status-good":"status-low"}`}>SSO {r.ssoComplete?"Done":"Pending"}</span><span className={`status-pill ${r.lsoComplete?"status-good":"status-low"}`}>LSO {r.lsoComplete?"Done":"Pending"}</span>{r.simSeller&&<span className="status-pill status-mid">SIM Seller</span>}</div>{r.reasons.length>0&&<div className="attention-reasons">{r.reasons.slice(0,2).map(x=><span key={x}>{x}</span>)}</div>}</div><div className="opportunity-metrics"><b>{r.ga}</b><small>GA</small><b>৳{fmt(r.c2s)}</b><small>C2S</small><span className="chevron">›</span></div></Link>):<div className="empty">No retailers match these filters.</div>}</div></section></>
}
export function AttentionSummary({rows}:{rows:RetailerOpportunity[]}){
 const sso=rows.filter(r=>r.simSeller&&!r.ssoComplete).length,lso=rows.filter(r=>!r.lsoComplete).length,noC2s=rows.filter(r=>r.c2s===0).length,unassigned=rows.filter(r=>!r.employeeId).length;
 return <div className="detail-stat-grid"><div className="card detail-stat"><div className="metric-label">SSO Pending</div><div className="detail-stat-value">{sso}</div></div><div className="card detail-stat"><div className="metric-label">LSO Pending</div><div className="detail-stat-value">{lso}</div></div><div className="card detail-stat"><div className="metric-label">No C2S</div><div className="detail-stat-value">{noC2s}</div></div><div className="card detail-stat"><div className="metric-label">Unassigned</div><div className="detail-stat-value">{unassigned}</div></div></div>
}
