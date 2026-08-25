"use client";
import Link from "next/link";
import {useEffect,useMemo,useState} from "react";
import {Icon} from "../components/icons";

type Row={employeeId:string;employeeCode?:string|null;name:string;supervisor:string;retailerCount:number;gaTarget:number;gaAchieved:number;ssoTarget:number;ssoAchieved:number;c2cTarget:number;c2cAchieved:number;scTarget:number;scAchieved:number;totalRechargeTarget:number;totalRechargeAchieved:number;lsoTarget:number;lsoAchieved:number};
function monthNow(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`}
const fmt=(n:number)=>new Intl.NumberFormat("en-BD",{maximumFractionDigits:0}).format(n);
const pct=(a:number,t:number)=>t?Math.round(a/t*100):0;

export default function Dashboard(){
 const [month,setMonth]=useState(monthNow()); const [rows,setRows]=useState<Row[]>([]); const [loading,setLoading]=useState(true); const [error,setError]=useState("");
 useEffect(()=>{let stop=false;(async()=>{setLoading(true);setError("");try{
  const q=`month=${month}-01`;
  const [ga,c2c,c2s,targets]=await Promise.all([
   fetch(`/api/ga/summary?${q}`,{cache:"no-store"}).then(r=>r.json()),
   fetch(`/api/c2c/summary?${q}`,{cache:"no-store"}).then(r=>r.json()),
   fetch(`/api/c2s/summary?${q}`,{cache:"no-store"}).then(r=>r.json()),
   fetch(`/api/targets?month=${month}`,{cache:"no-store"}).then(r=>r.json()),
  ]);
  const map=new Map<string,Row>();
  for(const t of targets.rows||[]) map.set(t.employeeId,{...t,gaAchieved:0,ssoAchieved:0,c2cAchieved:0,totalRechargeAchieved:Number(t.scAchieved||0),lsoAchieved:0});
  for(const r of ga.rows||[]){const x=map.get(r.employeeId);if(x){x.gaAchieved=r.gaAchieved;x.ssoAchieved=r.ssoAchieved}}
  for(const r of c2c.rows||[]){const x=map.get(r.employeeId);if(x){x.c2cAchieved=r.c2cAchieved;x.totalRechargeAchieved=r.totalRechargeAchieved}}
  for(const r of c2s.rows||[]){const x=map.get(r.employeeId);if(x)x.lsoAchieved=r.lsoAchieved}
  if(!stop)setRows([...map.values()]);
 }catch(e){if(!stop)setError(e instanceof Error?e.message:"Could not load dashboard") }finally{if(!stop)setLoading(false)}})();return()=>{stop=true}},[month]);
 const totals=useMemo(()=>rows.reduce((a,r)=>({gaT:a.gaT+r.gaTarget,gaA:a.gaA+r.gaAchieved,c2cT:a.c2cT+r.c2cTarget,c2cA:a.c2cA+r.c2cAchieved,scT:a.scT+r.scTarget,scA:a.scA+r.scAchieved,trT:a.trT+r.totalRechargeTarget,trA:a.trA+r.totalRechargeAchieved,ssoT:a.ssoT+r.ssoTarget,ssoA:a.ssoA+r.ssoAchieved,lsoT:a.lsoT+r.lsoTarget,lsoA:a.lsoA+r.lsoAchieved,ret:a.ret+r.retailerCount}),{gaT:0,gaA:0,c2cT:0,c2cA:0,scT:0,scA:0,trT:0,trA:0,ssoT:0,ssoA:0,lsoT:0,lsoA:0,ret:0}),[rows]);
 const ranked=useMemo(()=>[...rows].sort((a,b)=>pct(b.totalRechargeAchieved,b.totalRechargeTarget)-pct(a.totalRechargeAchieved,a.totalRechargeTarget)),[rows]);
 const overall=Math.round(([pct(totals.gaA,totals.gaT),pct(totals.c2cA,totals.c2cT),pct(totals.ssoA,totals.ssoT),pct(totals.lsoA,totals.lsoT)].filter(Boolean).reduce((a,b)=>a+b,0))/Math.max(1,[totals.gaT,totals.c2cT,totals.ssoT,totals.lsoT].filter(Boolean).length));
 return <main className="page">
  <header className="page-header"><div><div className="eyebrow">Admin Overview</div><h1 className="page-title">Good afternoon, Admin</h1><p className="page-subtitle">Track monthly sales performance and field execution at a glance.</p></div><div className="header-actions"><input className="control" type="month" value={month} onChange={e=>setMonth(e.target.value)}/><Link href="/ga" className="btn btn-primary"><Icon name="upload"/>Upload Data</Link></div></header>
  {error&&<div className="toast">{error}</div>}
  <section className="hero-card card"><div className="hero-row"><div><div className="hero-meta">Overall monthly progress</div><div className="hero-value">{loading?"…":`${overall}%`}</div><div className="hero-small">Across GA, C2C, SSO and LSO targets</div></div><div style={{textAlign:"right"}}><div className="hero-pct">{loading?"…":rows.length}</div><div className="hero-small">Active RSOs</div><div className="hero-pct" style={{fontSize:15,marginTop:8}}>{loading?"…":fmt(totals.ret)}</div><div className="hero-small">Mapped retailers</div></div></div><div className="progress"><span style={{width:`${Math.min(100,Math.max(0,overall))}%`}}/></div></section>
  <section className="section"><div className="section-head"><h2 className="section-title">Target vs Achievement</h2><Link href="/targets" className="section-link">Manage targets</Link></div><div className="kpi-grid">
   <Kpi label="GA" achieved={totals.gaA} target={totals.gaT}/><Kpi label="C2C" achieved={totals.c2cA} target={totals.c2cT} money/><Kpi label="SC" achieved={totals.scA} target={totals.scT} money/><Kpi label="Total Recharge" achieved={totals.trA} target={totals.trT} money/><Kpi label="SSO" achieved={totals.ssoA} target={totals.ssoT}/><Kpi label="LSO" achieved={totals.lsoA} target={totals.lsoT}/>
  </div></section>
  <div className="dashboard-grid">
   <section className="section"><div className="section-head"><h2 className="section-title">RSO Performance</h2><Link href={`/admin/performance?month=${month}`} className="section-link">View all</Link></div><div className="card panel">
    {loading?<div className="skeleton" style={{height:280}}/>:ranked.length?<div className="team-list">{ranked.slice(0,8).map(r=><TeamRow key={r.employeeId} row={r} month={month}/>)}</div>:<div className="empty">No employee data yet. Import Master Data and set targets first.</div>}
   </div></section>
   <section className="section"><div className="section-head"><h2 className="section-title">Quick Actions</h2></div><div className="card panel"><div className="quick-grid">
    <Quick href="/ga" icon="sim" label="GA Upload"/><Quick href="/c2c" icon="wallet" label="C2C Upload"/><Quick href="/c2s" icon="chart" label="C2S Upload"/><Quick href="/ob" icon="balance" label="Opening Balance"/><Quick href="/targets" icon="target" label="Targets"/><Quick href="/master-data" icon="users" label="Master Data"/><Quick href="/admin/attention" icon="target" label="Attention"/><Quick href="/admin/retailers" icon="search" label="Retailer Search"/>
   </div></div>
   <div className="card panel" style={{marginTop:12}}><div className="section-head" style={{marginBottom:12}}><h3 className="section-title" style={{fontSize:14}}>System status</h3><span className="status-pill status-good">Operational</span></div><div style={{display:"grid",gap:10,fontSize:11,color:"#667085"}}><Status label="Master data" value={`${rows.length} RSOs`}/><Status label="Month" value={month}/><Status label="Database" value="Connected"/></div></div>
   </section>
  </div>
 </main>
}
function Kpi({label,achieved,target,money:cash=false}:{label:string;achieved:number;target:number;money?:boolean}){const p=pct(achieved,target);return <div className="kpi-card card"><div><div className="kpi-top"><span className="kpi-label">{label}</span><span className="kpi-badge">{p}%</span></div><div className="kpi-value">{cash?"৳":""}{fmt(achieved)}</div></div><div><div className="kpi-foot"><span>Target {cash?"৳":""}{fmt(target)}</span><span>{target?fmt(Math.max(0,target-achieved)):"No target"}</span></div><div className="progress"><span style={{width:`${Math.min(100,p)}%`}}/></div></div></div>}
function TeamRow({row:r,month}:{row:Row;month:string}){const p=pct(r.totalRechargeAchieved,r.totalRechargeTarget);const cls=p>=80?"status-good":p>=50?"status-mid":"status-low";return <Link href={`/admin/rsos/${r.employeeId}?month=${month}`} className="team-row linked-row"><div className="team-person"><div className="person-avatar">{r.name.slice(0,2).toUpperCase()}</div><div style={{minWidth:0}}><div className="person-name">{r.name}</div><div className="person-meta">{r.supervisor} · {r.retailerCount} retailers</div></div></div><div className="mini-stats"><div className="mini-stat"><div className="mini-value">{r.gaAchieved}</div><div className="mini-label">GA</div></div><div className="mini-stat"><div className="mini-value">{r.lsoAchieved}</div><div className="mini-label">LSO</div></div><span className={`status-pill ${cls}`}>{p}%</span></div></Link>}
function Quick({href,icon,label}:{href:string;icon:string;label:string}){return <Link className="quick-action" href={href}><div className="quick-icon"><Icon name={icon}/></div><div className="quick-label">{label}</div></Link>}
function Status({label,value}:{label:string;value:string}){return <div style={{display:"flex",justifyContent:"space-between",gap:12}}><span>{label}</span><strong style={{color:"#344054"}}>{value}</strong></div>}
