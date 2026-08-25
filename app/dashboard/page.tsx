"use client";
import Link from "next/link";
import {useEffect,useMemo,useState} from "react";
import type {CSSProperties} from "react";
import {Icon} from "../components/icons";

type Row={
 employeeId:string;employeeCode?:string|null;name:string;supervisor:string;retailerCount:number;
 gaTarget:number;gaAchieved:number;ssoTarget:number;ssoAchieved:number;
 c2cTarget:number;c2cAchieved:number;scTarget:number;scAchieved:number;
 totalRechargeTarget:number;totalRechargeAchieved:number;lsoTarget:number;lsoAchieved:number
};

function monthNow(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`}
const fmt=(n:number)=>new Intl.NumberFormat("en-BD",{maximumFractionDigits:0}).format(n);
const pct=(a:number,t:number)=>t?Math.round(a/t*100):0;
const clamp=(n:number)=>Math.max(0,Math.min(100,n));

export default function Dashboard(){
 const [month,setMonth]=useState(monthNow());
 const [rows,setRows]=useState<Row[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");

 useEffect(()=>{let stop=false;(async()=>{
  setLoading(true);setError("");
  try{
   const q=`month=${month}-01`;
   const [ga,c2c,c2s,targets]=await Promise.all([
    fetch(`/api/ga/summary?${q}`,{cache:"no-store"}).then(r=>r.json()),
    fetch(`/api/c2c/summary?${q}`,{cache:"no-store"}).then(r=>r.json()),
    fetch(`/api/c2s/summary?${q}`,{cache:"no-store"}).then(r=>r.json()),
    fetch(`/api/targets?month=${month}`,{cache:"no-store"}).then(r=>r.json()),
   ]);
   const map=new Map<string,Row>();
   for(const t of targets.rows||[])map.set(t.employeeId,{...t,gaAchieved:0,ssoAchieved:0,c2cAchieved:0,totalRechargeAchieved:Number(t.scAchieved||0),lsoAchieved:0});
   for(const r of ga.rows||[]){const x=map.get(r.employeeId);if(x){x.gaAchieved=r.gaAchieved;x.ssoAchieved=r.ssoAchieved}}
   for(const r of c2c.rows||[]){const x=map.get(r.employeeId);if(x){x.c2cAchieved=r.c2cAchieved;x.totalRechargeAchieved=r.totalRechargeAchieved}}
   for(const r of c2s.rows||[]){const x=map.get(r.employeeId);if(x)x.lsoAchieved=r.lsoAchieved}
   if(!stop)setRows([...map.values()]);
  }catch(e){if(!stop)setError(e instanceof Error?e.message:"Could not load dashboard")}
  finally{if(!stop)setLoading(false)}
 })();return()=>{stop=true}},[month]);

 const totals=useMemo(()=>rows.reduce((a,r)=>({
  gaT:a.gaT+r.gaTarget,gaA:a.gaA+r.gaAchieved,
  c2cT:a.c2cT+r.c2cTarget,c2cA:a.c2cA+r.c2cAchieved,
  scT:a.scT+r.scTarget,scA:a.scA+r.scAchieved,
  trT:a.trT+r.totalRechargeTarget,trA:a.trA+r.totalRechargeAchieved,
  ssoT:a.ssoT+r.ssoTarget,ssoA:a.ssoA+r.ssoAchieved,
  lsoT:a.lsoT+r.lsoTarget,lsoA:a.lsoA+r.lsoAchieved,
  ret:a.ret+r.retailerCount
 }),{gaT:0,gaA:0,c2cT:0,c2cA:0,scT:0,scA:0,trT:0,trA:0,ssoT:0,ssoA:0,lsoT:0,lsoA:0,ret:0}),[rows]);

 const scored=useMemo(()=>rows.map(r=>{
  const recharge=pct(r.totalRechargeAchieved,r.totalRechargeTarget);
  const ga=pct(r.gaAchieved,r.gaTarget);
  const execution=Math.round((pct(r.ssoAchieved,r.ssoTarget)+pct(r.lsoAchieved,r.lsoTarget))/2);
  return {...r,score:Math.round((recharge+ga+execution)/3),recharge,ga};
 }).sort((a,b)=>b.score-a.score),[rows]);

 const supervisors=useMemo(()=>{
  const map=new Map<string,{name:string;rsos:number;retailers:number;achieved:number;target:number;ga:number;gaTarget:number}>();
  for(const r of rows){
   const x=map.get(r.supervisor)||{name:r.supervisor,rsos:0,retailers:0,achieved:0,target:0,ga:0,gaTarget:0};
   x.rsos++;x.retailers+=r.retailerCount;x.achieved+=r.totalRechargeAchieved;x.target+=r.totalRechargeTarget;x.ga+=r.gaAchieved;x.gaTarget+=r.gaTarget;
   map.set(r.supervisor,x);
  }
  return [...map.values()].sort((a,b)=>pct(b.achieved,b.target)-pct(a.achieved,a.target));
 },[rows]);

 const overall=useMemo(()=>{
  const vals=[
   totals.gaT?pct(totals.gaA,totals.gaT):null,
   totals.c2cT?pct(totals.c2cA,totals.c2cT):null,
   totals.ssoT?pct(totals.ssoA,totals.ssoT):null,
   totals.lsoT?pct(totals.lsoA,totals.lsoT):null
  ].filter((v):v is number=>v!==null);
  return vals.length?Math.round(vals.reduce((a,b)=>a+b,0)/vals.length):0;
 },[totals]);

 const behind=scored.filter(r=>r.score<50).length;
 const onTrack=scored.filter(r=>r.score>=70).length;

 return <main className="page admin-dashboard">
  <header className="admin-top">
   <div>
    <div className="admin-kicker">DMS CONTROL CENTER</div>
    <h1 className="admin-title">Admin Dashboard</h1>
    <p className="admin-sub">Monitor targets, team execution and daily operations from one place.</p>
   </div>
   <div className="admin-top-actions">
    <label className="admin-month"><span>Reporting month</span><input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label>
    <Link href="/ga" className="btn admin-primary"><Icon name="upload"/>Import Data</Link>
   </div>
  </header>

  {error&&<div className="toast">{error}</div>}

  <section className="admin-overview-grid">
   <div className="admin-command-card">
    <div className="command-glow"/>
    <div className="command-content">
     <div className="command-top"><span className="command-label">Monthly performance</span><span className="command-live"><i/>LIVE DATA</span></div>
     <div className="command-main">
      <div><div className="command-number">{loading?"…":`${overall}%`}</div><div className="command-caption">Overall target progress</div></div>
      <div className="command-ring" style={{"--p":`${clamp(overall)*3.6}deg`} as CSSProperties}><div><strong>{overall}%</strong><span>Progress</span></div></div>
     </div>
     <div className="command-progress"><span style={{width:`${clamp(overall)}%`}}/></div>
     <div className="command-stats">
      <div><strong>{loading?"…":rows.length}</strong><span>Active RSOs</span></div>
      <div><strong>{loading?"…":fmt(totals.ret)}</strong><span>Retailers</span></div>
      <div><strong>{loading?"…":onTrack}</strong><span>Strong performers</span></div>
      <div><strong>{loading?"…":behind}</strong><span>Need focus</span></div>
     </div>
    </div>
   </div>

   <div className="admin-side-stack">
    <Link href="/admin/attention" className="admin-mini-card alert-card">
     <span className="admin-mini-icon"><Icon name="target"/></span>
     <div><small>Field Execution</small><strong>Attention Center</strong><span>Review SSO & LSO gaps</span></div>
     <b>›</b>
    </Link>
    <Link href="/admin/retailers" className="admin-mini-card search-card">
     <span className="admin-mini-icon"><Icon name="search"/></span>
     <div><small>Master Search</small><strong>Find Retailer</strong><span>Code, RSO, route or name</span></div>
     <b>›</b>
    </Link>
   </div>
  </section>

  <section className="section admin-section">
   <div className="admin-section-head"><div><span>PERFORMANCE</span><h2>Target vs Achievement</h2></div><Link href="/targets">Manage targets <b>›</b></Link></div>
   <div className="admin-kpi-grid">
    <ModernKpi label="GA" icon="sim" achieved={totals.gaA} target={totals.gaT}/>
    <ModernKpi label="C2C" icon="wallet" achieved={totals.c2cA} target={totals.c2cT} money/>
    <ModernKpi label="SC" icon="balance" achieved={totals.scA} target={totals.scT} money/>
    <ModernKpi label="Total Recharge" icon="chart" achieved={totals.trA} target={totals.trT} money featured/>
    <ModernKpi label="SSO" icon="shop" achieved={totals.ssoA} target={totals.ssoT}/>
    <ModernKpi label="LSO" icon="target" achieved={totals.lsoA} target={totals.lsoT}/>
   </div>
  </section>

  <section className="admin-content-grid">
   <div className="section admin-section">
    <div className="admin-section-head"><div><span>TEAM PERFORMANCE</span><h2>RSO leaderboard</h2></div><Link href={`/admin/performance/rsos?month=${month}`}>View all <b>›</b></Link></div>
    <div className="card admin-table-card">
     {loading?<div className="skeleton" style={{height:360}}/>:scored.length?<div className="admin-leaderboard">
      {scored.slice(0,8).map((r,i)=><Link href={`/admin/rsos/${r.employeeId}?month=${month}`} className="admin-rank-row" key={r.employeeId}>
       <div className={`admin-rank rank-${i+1}`}>{i+1}</div>
       <div className="admin-person"><span>{r.name.slice(0,2).toUpperCase()}</span><div><strong>{r.name}</strong><small>{r.supervisor} · {r.retailerCount} retailers</small></div></div>
       <div className="admin-inline-kpis"><span><b>{r.gaAchieved}</b><small>GA</small></span><span><b>{r.lsoAchieved}</b><small>LSO</small></span><span><b>{r.recharge}%</b><small>Recharge</small></span></div>
       <div className={`admin-score ${r.score>=70?"good":r.score>=50?"mid":"low"}`}><strong>{r.score}</strong><small>Score</small></div>
      </Link>)}
     </div>:<div className="admin-empty"><Icon name="users"/><strong>No performance data yet</strong><span>Import master data and set monthly targets first.</span></div>}
    </div>
   </div>

   <div className="section admin-section">
    <div className="admin-section-head"><div><span>OPERATIONS</span><h2>Quick access</h2></div></div>
    <div className="admin-quick-grid">
     <AdminQuick href="/ga" icon="sim" title="GA Upload" sub="Daily activation"/>
     <AdminQuick href="/c2c" icon="wallet" title="C2C Upload" sub="Stock lifting"/>
     <AdminQuick href="/c2s" icon="chart" title="C2S Upload" sub="Retail sales"/>
     <AdminQuick href="/ob" icon="balance" title="Opening Balance" sub="Latest snapshot"/>
     <AdminQuick href="/targets" icon="target" title="Targets & SC" sub="Monthly setup"/>
     <AdminQuick href="/master-data" icon="users" title="Master Data" sub="Employees & retailers"/>
     <AdminQuick href="/admin/bp-management" icon="shop" title="BP Management" sub="Assignments"/>
     <AdminQuick href="/admin/users" icon="users" title="Users & Access" sub="Role accounts"/>
    </div>

    <div className="admin-system-card card">
     <div className="admin-system-head"><div><span className="system-dot"/>System status</div><b>Operational</b></div>
     <div className="admin-system-list">
      <div><span>Database</span><strong>Connected</strong></div>
      <div><span>Reporting month</span><strong>{month}</strong></div>
      <div><span>Mapped RSOs</span><strong>{rows.length}</strong></div>
      <div><span>Mapped retailers</span><strong>{fmt(totals.ret)}</strong></div>
     </div>
    </div>
   </div>
  </section>

  <section className="section admin-section">
   <div className="admin-section-head"><div><span>SUPERVISORS</span><h2>Team overview</h2></div></div>
   <div className="admin-supervisor-grid">
    {supervisors.length?supervisors.map(s=><div className="card admin-supervisor-card" key={s.name}>
     <div className="supervisor-head"><div className="supervisor-avatar">{s.name.slice(0,2).toUpperCase()}</div><div><strong>{s.name}</strong><span>{s.rsos} RSOs · {s.retailers} retailers</span></div><b>{pct(s.achieved,s.target)}%</b></div>
     <div className="supervisor-bars"><div><span>Recharge</span><small>{pct(s.achieved,s.target)}%</small></div><div className="progress"><span style={{width:`${clamp(pct(s.achieved,s.target))}%`}}/></div><div><span>GA</span><small>{pct(s.ga,s.gaTarget)}%</small></div><div className="progress"><span style={{width:`${clamp(pct(s.ga,s.gaTarget))}%`}}/></div></div>
    </div>):<div className="admin-empty card"><Icon name="users"/><strong>No supervisor data</strong></div>}
   </div>
  </section>
 </main>
}

function ModernKpi({label,icon,achieved,target,money=false,featured=false}:{label:string;icon:string;achieved:number;target:number;money?:boolean;featured?:boolean}){
 const p=pct(achieved,target),remaining=Math.max(0,target-achieved);
 return <div className={`card admin-kpi ${featured?"featured":""}`}>
  <div className="admin-kpi-top"><span className="admin-kpi-icon"><Icon name={icon}/></span><span className={`admin-kpi-pct ${p>=80?"good":p>=50?"mid":"low"}`}>{p}%</span></div>
  <div className="admin-kpi-label">{label}</div>
  <div className="admin-kpi-value">{money?"৳":""}{fmt(achieved)}</div>
  <div className="admin-kpi-meta"><span>Target {money?"৳":""}{fmt(target)}</span><span>{target?`${money?"৳":""}${fmt(remaining)} left`:"No target"}</span></div>
  <div className="progress"><span style={{width:`${clamp(p)}%`}}/></div>
 </div>
}

function AdminQuick({href,icon,title,sub}:{href:string;icon:string;title:string;sub:string}){
 return <Link href={href} className="card admin-quick"><span><Icon name={icon}/></span><div><strong>{title}</strong><small>{sub}</small></div><b>›</b></Link>
}
