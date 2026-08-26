"use client";
import Link from "next/link";
import {useEffect,useMemo,useState} from "react";
import type {CSSProperties} from "react";
import {Icon} from "../components/icons";
import {dhakaMonth} from "../../lib/business-time";

type Row={
 employeeId:string;employeeCode?:string|null;name:string;supervisor:string;retailerCount:number;
 gaTarget:number;gaAchieved:number;ssoTarget:number;ssoAchieved:number;
 c2cTarget:number;c2cAchieved:number;scTarget:number;scAchieved:number;
 totalRechargeTarget:number;totalRechargeAchieved:number;lsoTarget:number;lsoAchieved:number
};

function monthNow(){return dhakaMonth()}
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
 const topPerformer=scored[0]||null;
 const weakest=scored.at(-1)||null;
 const targetReady=rows.filter(r=>r.gaTarget||r.c2cTarget||r.totalRechargeTarget||r.ssoTarget||r.lsoTarget).length;
 const targetCoverage=rows.length?Math.round(targetReady/rows.length*100):0;
 const avgRetailers=rows.length?Math.round(totals.ret/rows.length):0;
 const supervisorOnTrack=supervisors.filter(s=>pct(s.achieved,s.target)>=70).length;
 const gaProgress=pct(totals.gaA,totals.gaT);
 const rechargeProgress=pct(totals.trA,totals.trT);
 const ssoProgress=pct(totals.ssoA,totals.ssoT);
 const lsoProgress=pct(totals.lsoA,totals.lsoT);
 const attention=[...scored].filter(r=>r.score<70).sort((a,b)=>a.score-b.score).slice(0,4);

 return <main className="page admin-dashboard-v97">
  <header className="dash97-top">
   <div>
    <span className="dash97-kicker">DISTRIBUTION OVERVIEW</span>
    <h1>Performance Dashboard</h1>
    <p>{month} · Month-to-date operational snapshot</p>
   </div>
   <div className="dash97-top-actions">
    <label className="dash97-month"><span>REPORTING MONTH</span><input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label>
    <Link href="/admin/upload" className="dash97-primary"><Icon name="upload"/>Upload Center</Link>
   </div>
  </header>

  {error&&<div className="dash97-alert"><b>!</b><div><strong>Dashboard could not refresh</strong><span>{error}</span></div></div>}

  <section className="dash97-kpis" aria-label="Key performance indicators">
   <CleanKpi label="GA Activation" value={loading?"…":fmt(totals.gaA)} progress={gaProgress} note={`of ${fmt(totals.gaT)} target`} icon="sim"/>
   <CleanKpi label="Total Recharge" value={loading?"…":`৳${fmt(totals.trA)}`} progress={rechargeProgress} note={`of ৳${fmt(totals.trT)} target`} icon="chart" tone="teal"/>
   <CleanKpi label="Field Force" value={loading?"…":fmt(rows.length)} progress={rows.length?Math.round(onTrack/rows.length*100):0} note={`${onTrack} on track · ${fmt(totals.ret)} retailers`} icon="users"/>
   <article className="dash97-kpi critical">
    <div className="dash97-critical-icon"><Icon name="target"/></div>
    <div><span>NEEDS ATTENTION</span><strong>{loading?"…":behind}</strong><small>RSO below 50 composite score</small></div>
   </article>
  </section>

  <section className="dash97-main-grid">
   <div className="dash97-block">
    <div className="dash97-section-head"><div><h2>Quick reports</h2><p>Open the daily workspaces you use most.</p></div><Link href="/admin/performance/rsos">View analytics →</Link></div>
    <div className="dash97-report-grid">
     <QuickReport href="/ga" icon="sim" title="GA & SSO" sub="Activations and SIM swap"/>
     <QuickReport href="/c2c" icon="wallet" title="C2C Recharge" sub="Stock lifting performance"/>
     <QuickReport href="/c2s" icon="chart" title="C2S & LSO" sub="Retail sales execution"/>
     <QuickReport href="/ob" icon="balance" title="Opening Balance" sub="Latest balance snapshot"/>
    </div>
   </div>

   <aside className="dash97-panel dash97-team">
    <div className="dash97-section-head compact"><div><h2>Team snapshot</h2><p>Current field network.</p></div></div>
    <SnapshotRow label="Active RSO" value={rows.length} tone="green"/>
    <SnapshotRow label="Supervisors" value={supervisors.length} tone="teal"/>
    <SnapshotRow label="Retailers" value={totals.ret} tone="gold"/>
    <SnapshotRow label="Target coverage" value={`${targetCoverage}%`} tone="slate"/>
    <Link href="/admin/employees" className="dash97-panel-btn"><Icon name="users"/>Employee Control Center</Link>
   </aside>
  </section>

  <section className="dash97-lower-grid">
   <div className="dash97-panel dash97-performance">
    <div className="dash97-section-head"><div><h2>Supervisor performance</h2><p>Recharge and GA progress by team.</p></div><Link href={`/admin/performance/supervisors?month=${month}`}>View all →</Link></div>
    <div className="dash97-team-list">
     {supervisors.slice(0,6).map((x,i)=>{
      const recharge=pct(x.achieved,x.target),ga=pct(x.ga,x.gaTarget);
      return <Link href={`/admin/performance/supervisors?month=${month}`} className="dash97-team-row" key={x.name}>
       <span className="dash97-avatar">{x.name.slice(0,2).toUpperCase()}</span>
       <div className="dash97-team-copy"><strong>{x.name}</strong><small>{x.rsos} RSOs · {x.retailers} retailers</small></div>
       <div className="dash97-dual">
        <span><i style={{width:`${clamp(recharge)}%`}}/></span>
        <span className="alt"><i style={{width:`${clamp(ga)}%`}}/></span>
       </div>
       <b>{recharge}%</b>
      </Link>
     })}
     {!supervisors.length&&<div className="dash97-empty">No supervisor data available.</div>}
    </div>
    <div className="dash97-legend"><span><i/>Recharge</span><span><i/>GA</span></div>
   </div>

   <aside className="dash97-panel dash97-watch">
    <div className="dash97-section-head"><div><h2>Attention watchlist</h2><p>Lowest composite execution scores.</p></div><Link href="/admin/attention">Open list →</Link></div>
    <div className="dash97-watch-list">
     {attention.map(r=><Link href={`/admin/rsos/${r.employeeId}?month=${month}`} className="dash97-watch-row" key={r.employeeId}>
      <span className="dash97-watch-dot"/>
      <div><strong>{r.name}</strong><small>{r.supervisor} · GA {r.ga}% · Recharge {r.recharge}%</small></div>
      <b className={r.score<50?"critical":"warn"}>{r.score}</b>
     </Link>)}
     {!attention.length&&<div className="dash97-good-state"><Icon name="chart"/><strong>No priority risks</strong><span>All scored RSOs are currently at 70+.</span></div>}
    </div>
   </aside>
  </section>

  <section className="dash97-footer-grid">
   <div className="dash97-panel">
    <div className="dash97-section-head"><div><h2>Business KPI progress</h2><p>Core monthly target completion.</p></div><Link href="/targets">Manage targets →</Link></div>
    <div className="dash97-progress-list">
     <ProgressLine label="GA" achieved={totals.gaA} target={totals.gaT}/>
     <ProgressLine label="Recharge" achieved={totals.trA} target={totals.trT} money/>
     <ProgressLine label="SSO" achieved={totals.ssoA} target={totals.ssoT}/>
     <ProgressLine label="LSO" achieved={totals.lsoA} target={totals.lsoT}/>
    </div>
   </div>

   <div className="dash97-panel dash97-shortcuts">
    <div className="dash97-section-head compact"><div><h2>Administration</h2><p>Common management tools.</p></div></div>
    <div>
     <AdminShortcut href="/admin/users" icon="users" title="Login Accounts"/>
     <AdminShortcut href="/admin/permissions" icon="shield" title="Permissions"/>
     <AdminShortcut href="/admin/audit" icon="chart" title="Activity Log"/>
     <AdminShortcut href="/targets" icon="target" title="Targets"/>
    </div>
   </div>
  </section>
 </main>
}

function CleanKpi({label,value,progress,note,icon,tone="green"}:{label:string;value:string;progress:number;note:string;icon:string;tone?:string}){
 const p=clamp(progress);
 return <article className={`dash97-kpi tone-${tone}`}>
  <div className="dash97-ring" style={{"--dash97-p":`${p*3.6}deg`} as CSSProperties}>
   <div><Icon name={icon}/><b>{p}%</b></div>
  </div>
  <div><span>{label}</span><strong>{value}</strong><small>{note}</small></div>
 </article>
}

function QuickReport({href,icon,title,sub}:{href:string;icon:string;title:string;sub:string}){
 return <Link href={href} className="dash97-report"><span><Icon name={icon}/></span><div><strong>{title}</strong><small>{sub}</small></div><b>›</b></Link>
}

function SnapshotRow({label,value,tone}:{label:string;value:string|number;tone:string}){
 return <div className="dash97-snapshot"><span><i className={`tone-${tone}`}/>{label}</span><strong>{typeof value==="number"?fmt(value):value}</strong></div>
}

function ProgressLine({label,achieved,target,money=false}:{label:string;achieved:number;target:number;money?:boolean}){
 const p=pct(achieved,target);
 return <div className="dash97-progress-row">
  <div><strong>{label}</strong><span>{money?"৳":""}{fmt(achieved)} / {money?"৳":""}{fmt(target)}</span><b>{p}%</b></div>
  <div className="dash97-progress-track"><i style={{width:`${clamp(p)}%`}}/></div>
 </div>
}

function AdminShortcut({href,icon,title}:{href:string;icon:string;title:string}){
 return <Link href={href} className="dash97-admin-link"><span><Icon name={icon}/>{title}</span><b>›</b></Link>
}
