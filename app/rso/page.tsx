import {requireUser} from "../../lib/auth";
import {employeePerformance,pct} from "../../lib/performance";
import {PageHead,Metric,ProgressCard,QuickAction,PersonList} from "../components/RoleUI";
import {AttentionHero} from "../components/RoleAttention";
import {prisma} from "../../lib/prisma";
import {monthBounds} from "../../lib/month";
import {latestDailySnapshot,monthPace,paceStatus} from "../../lib/intelligence";
import {DailyStrip} from "../components/PerformanceIntelligence";

export default async function RSO(){
 const u=await requireUser(["RSO"]);
 if(!u.employeeId)return <main className="page"><PageHead eyebrow="RSO" title="Account not mapped" subtitle="Ask Admin to link this login to an RSO employee record."/></main>;
 const month=new Date().toISOString().slice(0,7)+"-01",r=(await employeePerformance(month,[u.employeeId]))[0];
 if(!r)return null;
 const {start,end}=monthBounds(month),expected=monthPace(month),daily=await latestDailySnapshot([u.employeeId]);
 const retailers=await prisma.retailer.findMany({where:{employeeId:u.employeeId,active:true},select:{id:true,retailerCode:true,retailerName:true,simSeller:true,c2sRecords:{where:{date:{gte:start,lt:end}},select:{amount:true,transactionCount:true}},gaActivations:{where:{activationDate:{gte:start,lt:end}},select:{id:true}}}});
 const attention=retailers.map(x=>{const amount=x.c2sRecords.reduce((a,v)=>a+Number(v.amount),0),trx=x.c2sRecords.reduce((a,v)=>a+v.transactionCount,0),ga=x.gaActivations.length;return {x,amount,trx,ga}}).filter(v=>(v.amount<500||v.trx<7)||((v.x.simSeller||"").toUpperCase()==="Y"&&v.ga<2)).slice(0,6);
 const gaPace=paceStatus(r.gaAchieved,r.gaTarget,expected),rechargePace=paceStatus(r.totalRechargeAchieved,r.totalRechargeTarget,expected);
 return <main className="page field-page">
  <PageHead eyebrow="My Performance" title={`Hello, ${u.displayName}`} subtitle={`Live status · ${expected}% of the month elapsed.`}/>
  <AttentionHero count={attention.length} href="/rso/attention" label="Retailer focus"/>
  <DailyStrip ga={daily.gaTotal} gaDate={daily.gaDate} c2c={daily.c2cTotal} c2cDate={daily.c2cDate}/>
  <div className="field-hero card"><div><div className="hero-meta">Monthly GA</div><div className="field-hero-value">{r.gaAchieved} <span>/ {r.gaTarget}</span></div><div className="hero-small">{pct(r.gaAchieved,r.gaTarget)}% completed · {gaPace.status}</div></div><div className="field-ring"><strong>{pct(r.gaAchieved,r.gaTarget)}%</strong><span>{gaPace.status}</span></div></div>
  <div className="role-metric-grid compact"><Metric label="Retailers" value={r.retailerCount} sub="Assigned" icon="shop"/><Metric label="SSO" value={`${r.ssoAchieved} / ${r.ssoTarget}`} sub={`${Math.max(0,r.ssoTarget-r.ssoAchieved)} remaining`} icon="sim"/><Metric label="LSO" value={`${r.lsoAchieved} / ${r.lsoTarget}`} sub={`${Math.max(0,r.lsoTarget-r.lsoAchieved)} remaining`} icon="target"/></div>
  <section className="section"><div className="section-head"><h2 className="section-title">Target pace</h2><span className={`pace-pill ${rechargePace.status==="Behind"?"pace-behind":rechargePace.status==="Ahead"?"pace-ahead":"pace-track"}`}>{rechargePace.status}</span></div><div className="progress-grid field-progress"><ProgressCard title="C2C" value={r.c2cAchieved} target={r.c2cTarget} unit="৳"/><ProgressCard title="Total Recharge" value={r.totalRechargeAchieved} target={r.totalRechargeTarget} unit="৳"/></div></section>
  <section className="section"><div className="quick-grid field-actions"><QuickAction href="/rso/attention" label="Attention" icon="target" module="attention"/><QuickAction href="/rso/retailers" label="My Retailers" icon="shop" module="retailers"/><QuickAction href="/rso/bp" label="My BP" icon="users" module="bp"/></div></section>
  <PersonList title="Needs attention" items={attention.map(v=>({name:v.x.retailerName||v.x.retailerCode,meta:`${v.x.retailerCode} · ${v.trx} C2S trx · ৳${Math.round(v.amount).toLocaleString()}`,right:(v.x.simSeller||"").toUpperCase()==="Y"?`${v.ga}/2 GA`:`${Math.max(0,7-v.trx)} trx left`,status:(v.x.simSeller||"").toUpperCase()==="Y"&&v.ga<2?"SSO":"LSO"}))}/>
 </main>
}
