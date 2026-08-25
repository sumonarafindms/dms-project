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

 return <main className="page admin-dashboard admin-v2">
  <section className="admin-v2-head">
   <div className="admin-v2-heading">
    <div className="admin-kicker">EXECUTIVE COMMAND CENTER</div>
    <h1>Distribution Performance</h1>
    <p>Monitor network execution, target pace, team health and operational priorities from one decision-ready view.</p>
   </div>
   <div className="admin-v2-head-actions">
    <label className="admin-v2-month"><span>REPORTING MONTH</span><input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label>
    <Link href="/admin/upload" className="btn admin-primary"><Icon name="upload"/>Upload Center</Link>
   </div>
  </section>

  {error&&<div className="admin-v2-alert"><span>!</span><div><strong>Dashboard could not refresh</strong><small>{error}</small></div></div>}

  <section className="admin-v2-command-grid">
   <article className="admin-v2-hero">
    <div className="admin-v2-hero-glow one"/><div className="admin-v2-hero-glow two"/>
    <div className="admin-v2-hero-top"><div><span>MONTHLY EXECUTION SCORE</span><small>{month}</small></div><b><i/> Live</b></div>
    <div className="admin-v2-hero-main">
     <div className="admin-v2-score"><strong>{loading?"…":overall}</strong><span>%</span><small>Overall progress</small></div>
     <div className="admin-v2-ring" style={{"--p":`${clamp(overall)*3.6}deg`} as CSSProperties}><div><b>{overall}%</b><small>Target</small></div></div>
    </div>
    <div className="admin-v2-hero-progress"><span style={{width:`${clamp(overall)}%`}}/></div>
    <div className="admin-v2-hero-stats">
     <div><span>Active RSO</span><strong>{loading?"…":rows.length}</strong></div>
     <div><span>Retailers</span><strong>{loading?"…":fmt(totals.ret)}</strong></div>
     <div><span>On track</span><strong>{loading?"…":onTrack}</strong></div>
     <div className={behind?"needs-focus":""}><span>Need focus</span><strong>{loading?"…":behind}</strong></div>
    </div>
   </article>

   <aside className="admin-v2-focus">
    <Link href="/admin/attention" className="admin-v2-focus-card urgent">
     <span className="admin-v2-focus-icon"><Icon name="target"/></span><div><small>ACTION REQUIRED</small><strong>{behind} RSO{behind===1?"":"s"} need focus</strong><p>Open SSO, LSO and performance gaps.</p></div><b>›</b>
    </Link>
    <Link href="/admin/performance/retailers" className="admin-v2-focus-card">
     <span className="admin-v2-focus-icon"><Icon name="shop"/></span><div><small>FIELD NETWORK</small><strong>{fmt(totals.ret)} retailers</strong><p>Review outlet execution and status.</p></div><b>›</b>
    </Link>
    <div className="admin-v2-health">
     <div><span className="health-dot"/><strong>System operational</strong></div>
     <small>Data views are connected to live DMS records.</small>
    </div>
   </aside>
  </section>

  <section className="admin-v2-section">
   <div className="admin-v2-section-head"><div><span>BUSINESS KPIs</span><h2>Target vs Achievement</h2><p>Monthly execution across the core distribution metrics.</p></div><Link href="/targets">Manage targets <b>›</b></Link></div>
   <div className="admin-v2-kpis">
    <V2Kpi tone="blue" label="GA" icon="sim" achieved={totals.gaA} target={totals.gaT}/>
    <V2Kpi tone="violet" label="C2C" icon="wallet" achieved={totals.c2cA} target={totals.c2cT} money/>
    <V2Kpi tone="cyan" label="SC" icon="balance" achieved={totals.scA} target={totals.scT} money/>
    <V2Kpi tone="green" label="Total Recharge" icon="chart" achieved={totals.trA} target={totals.trT} money featured/>
    <V2Kpi tone="orange" label="SSO" icon="shop" achieved={totals.ssoA} target={totals.ssoT}/>
    <V2Kpi tone="rose" label="LSO" icon="target" achieved={totals.lsoA} target={totals.lsoT}/>
   </div>
  </section>

  <section className="admin-exec-v49">
   <div className="admin-v2-section-head"><div><span>EXECUTIVE INTELLIGENCE</span><h2>What needs your attention</h2><p>Fast signals derived from the current monthly performance picture.</p></div><Link href={`/admin/performance/rsos?month=${month}`}>Open analytics <b>›</b></Link></div>
   <div className="admin-exec-v49-grid">
    <article className="admin-exec-v49-card spotlight">
     <div className="admin-exec-v49-card-head"><span><Icon name="chart"/></span><b>TOP PERFORMER</b></div>
     <strong>{topPerformer?.name||"No data"}</strong>
     <p>{topPerformer?`${topPerformer.score} composite score · ${topPerformer.recharge}% recharge · ${topPerformer.ga}% GA`:"Import performance data to populate this insight."}</p>
     {topPerformer&&<Link href={`/admin/rsos/${topPerformer.employeeId}?month=${month}`}>View employee <b>›</b></Link>}
    </article>
    <article className="admin-exec-v49-card risk">
     <div className="admin-exec-v49-card-head"><span><Icon name="target"/></span><b>PRIORITY RISK</b></div>
     <strong>{weakest?.name||"No data"}</strong>
     <p>{weakest?`${weakest.score} composite score · ${Math.max(0,70-weakest.score)} points below on-track threshold`:"No current performance risk is available."}</p>
     {weakest&&<Link href={`/admin/rsos/${weakest.employeeId}?month=${month}`}>Review RSO <b>›</b></Link>}
    </article>
    <article className="admin-exec-v49-card">
     <div className="admin-exec-v49-card-head"><span><Icon name="target"/></span><b>TARGET COVERAGE</b></div>
     <strong>{targetCoverage}%</strong>
     <p>{targetReady} of {rows.length} RSOs have at least one active monthly target configured.</p>
     <Link href="/targets">Manage targets <b>›</b></Link>
    </article>
    <article className="admin-exec-v49-card">
     <div className="admin-exec-v49-card-head"><span><Icon name="users"/></span><b>NETWORK DENSITY</b></div>
     <strong>{avgRetailers}</strong>
     <p>Average retailers per active RSO · {supervisorOnTrack} of {supervisors.length} supervisor teams at 70%+ recharge progress.</p>
     <Link href={`/admin/performance/supervisors?month=${month}`}>View teams <b>›</b></Link>
    </article>
   </div>
  </section>

  <section className="admin-v2-main-grid">
   <div className="admin-v2-section">
    <div className="admin-v2-section-head compact"><div><span>TEAM PERFORMANCE</span><h2>RSO leaderboard</h2></div><Link href={`/admin/performance/rsos?month=${month}`}>View all <b>›</b></Link></div>
    <div className="admin-v2-table-card">
     {loading?<div className="skeleton" style={{height:410}}/>:scored.length?<div className="admin-v2-leaderboard">
      <div className="admin-v2-table-head"><span>Rank</span><span>Employee</span><span>GA</span><span>Recharge</span><span>Score</span></div>
      {scored.slice(0,8).map((r,i)=><Link href={`/admin/rsos/${r.employeeId}?month=${month}`} className="admin-v2-rank-row" key={r.employeeId}>
       <span className={`admin-v2-rank rank-${i+1}`}>{i+1}</span>
       <div className="admin-v2-person"><span>{r.name.slice(0,2).toUpperCase()}</span><div><strong>{r.name}</strong><small>{r.supervisor} · {r.retailerCount} retailers</small></div></div>
       <div className="admin-v2-cell"><strong>{r.gaAchieved}/{r.gaTarget}</strong><small>{r.ga}%</small></div>
       <div className="admin-v2-cell"><strong>{r.recharge}%</strong><small>target</small></div>
       <span className={`admin-v2-score-pill ${r.score>=70?"good":r.score>=50?"mid":"low"}`}>{r.score}</span>
      </Link>)}
     </div>:<div className="admin-empty"><Icon name="users"/><strong>No performance data yet</strong><span>Import master data and set monthly targets first.</span></div>}
    </div>
   </div>

   <aside className="admin-v2-section">
    <div className="admin-v2-section-head compact"><div><span>SHORTCUTS</span><h2>Daily operations</h2></div></div>
    <div className="admin-v2-actions">
     <AdminQuick href="/ga" icon="sim" title="GA Upload" sub="Daily activation"/>
     <AdminQuick href="/c2c" icon="wallet" title="C2C" sub="Stock lifting"/>
     <AdminQuick href="/c2s" icon="chart" title="C2S" sub="Retail sales"/>
     <AdminQuick href="/ob" icon="balance" title="Opening Balance" sub="Latest snapshot"/>
     <AdminQuick href="/targets" icon="target" title="Targets" sub="Monthly setup"/>
     <AdminQuick href="/admin/employees" icon="users" title="Employees" sub="Hierarchy & access"/>
    </div>
    <div className="admin-v2-ops-card">
     <div className="admin-v2-ops-head"><span><Icon name="upload"/></span><div><strong>Data Operations</strong><small>Master files, targets and reports</small></div></div>
     <Link href="/admin/upload">Open Upload Center <b>›</b></Link>
    </div>
   </aside>
  </section>

  <section className="admin-exec-v49-operations">
   <div className="admin-exec-v49-op-copy"><span>OPERATIONS CONTROL</span><h2>Keep reporting data current</h2><p>Upload source files, maintain targets, validate people mappings and review exceptions before field teams consume the data.</p></div>
   <div className="admin-exec-v49-op-links">
    <Link href="/admin/upload"><Icon name="upload"/><span><strong>Upload Center</strong><small>Daily & master files</small></span><b>›</b></Link>
    <Link href="/admin/audit"><Icon name="chart"/><span><strong>Activity Log</strong><small>Security & history</small></span><b>›</b></Link>
    <Link href="/admin/permissions"><Icon name="users"/><span><strong>Access Control</strong><small>Permissions & roles</small></span><b>›</b></Link>
   </div>
  </section>

  <section className="admin-v2-section">
   <div className="admin-v2-section-head"><div><span>TEAM STRUCTURE</span><h2>Supervisor overview</h2><p>Compare recharge and GA execution by team.</p></div><Link href={`/admin/performance/supervisors?month=${month}`}>Supervisor performance <b>›</b></Link></div>
   <div className="admin-v2-supervisors">
    {supervisors.length?supervisors.map((s,i)=><article className="admin-v2-supervisor" key={s.name}>
     <div className="admin-v2-supervisor-top"><span className={`team-avatar team-${(i%4)+1}`}>{s.name.slice(0,2).toUpperCase()}</span><div><strong>{s.name}</strong><small>{s.rsos} RSOs · {s.retailers} retailers</small></div><b>{pct(s.achieved,s.target)}%</b></div>
     <div className="admin-v2-supervisor-metric"><div><span>Recharge</span><b>{pct(s.achieved,s.target)}%</b></div><div className="admin-v2-mini-progress"><span style={{width:`${clamp(pct(s.achieved,s.target))}%`}}/></div></div>
     <div className="admin-v2-supervisor-metric"><div><span>GA</span><b>{pct(s.ga,s.gaTarget)}%</b></div><div className="admin-v2-mini-progress alt"><span style={{width:`${clamp(pct(s.ga,s.gaTarget))}%`}}/></div></div>
    </article>):<div className="admin-empty card"><Icon name="users"/><strong>No supervisor data</strong></div>}
   </div>
  </section>
 </main>
}

function V2Kpi({tone,label,icon,achieved,target,money=false,featured=false}:{tone:string;label:string;icon:string;achieved:number;target:number;money?:boolean;featured?:boolean}){
 const p=pct(achieved,target),remaining=Math.max(0,target-achieved);
 return <article className={`admin-v2-kpi tone-${tone} ${featured?"featured":""}`}>
  <div className="admin-v2-kpi-top"><span><Icon name={icon}/></span><b className={p>=80?"good":p>=50?"mid":"low"}>{p}%</b></div>
  <div className="admin-v2-kpi-label">{label}</div>
  <strong className="admin-v2-kpi-value">{money?"৳":""}{fmt(achieved)}</strong>
  <div className="admin-v2-kpi-meta"><span>Target {money?"৳":""}{fmt(target)}</span><span>{target?`${money?"৳":""}${fmt(remaining)} left`:"No target"}</span></div>
  <div className="admin-v2-mini-progress"><span style={{width:`${clamp(p)}%`}}/></div>
 </article>
}

function AdminQuick({href,icon,title,sub}:{href:string;icon:string;title:string;sub:string}){
 return <Link href={href} className="admin-v2-action"><span><Icon name={icon}/></span><div><strong>{title}</strong><small>{sub}</small></div><b>›</b></Link>
}
