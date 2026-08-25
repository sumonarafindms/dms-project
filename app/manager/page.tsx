import {requireUser} from "../../lib/auth";
import {employeePerformance,pct} from "../../lib/performance";
import {prisma} from "../../lib/prisma";
import {PageHead,Metric,ProgressCard,PersonList,QuickAction} from "../components/RoleUI";
import {AttentionHero} from "../components/RoleAttention";
import {retailerOpportunities} from "../../lib/retailer-opportunities";
import {latestDailySnapshot,monthPace,rankRows} from "../../lib/intelligence";
import {DailyStrip,RankingList} from "../components/PerformanceIntelligence";

export default async function Manager(){
 await requireUser(["MANAGER"]);
 const month=new Date().toISOString().slice(0,7)+"-01";
 const [rows,attentionRows,sup,daily]=await Promise.all([
   employeePerformance(month),
   retailerOpportunities(month),
   prisma.supervisor.count({where:{active:true}}),
   latestDailySnapshot()
 ]);
 const attention=attentionRows.filter(x=>x.priority>0).length,ret=rows.reduce((a,r)=>a+r.retailerCount,0);
 const sum=(k:keyof typeof rows[number])=>rows.reduce((a,r)=>a+Number(r[k]||0),0);
 const expected=monthPace(month),ranked=rankRows(rows,expected);
 const by=new Map<string,{rso:number;ret:number;a:number;t:number}>();
 for(const r of rows){const x=by.get(r.supervisor)||{rso:0,ret:0,a:0,t:0};x.rso++;x.ret+=r.retailerCount;x.a+=r.totalRechargeAchieved;x.t+=r.totalRechargeTarget;by.set(r.supervisor,x)}
 return <main className="page">
  <PageHead eyebrow="Manager" title="Performance overview" subtitle={`Live team monitoring · ${expected}% of the month elapsed.`}/>
  <AttentionHero count={attention} href="/manager/attention"/>
  <DailyStrip ga={daily.gaTotal} gaDate={daily.gaDate} c2c={daily.c2cTotal} c2cDate={daily.c2cDate}/>
  <div className="role-metric-grid"><Metric label="Supervisors" value={sup} sub="Active teams" icon="users"/><Metric label="RSOs" value={rows.length} sub="Across all teams" icon="chart"/><Metric label="Retailers" value={ret.toLocaleString()} sub="Mapped outlets" icon="shop"/></div>
  <section className="section"><div className="section-head"><h2 className="section-title">Monthly progress</h2><span className="section-link">Expected pace {expected}%</span></div><div className="progress-grid"><ProgressCard title="GA" value={sum("gaAchieved")} target={sum("gaTarget")}/><ProgressCard title="C2C" value={sum("c2cAchieved")} target={sum("c2cTarget")} unit="৳"/><ProgressCard title="LSO" value={sum("lsoAchieved")} target={sum("lsoTarget")}/></div></section>
  <RankingList title="RSO ranking" rows={ranked.slice(0,10)} base="/manager/rsos" month={month}/>
  <PersonList title="Supervisor performance" items={[...by.entries()].map(([name,x])=>({name,meta:`${x.rso} RSOs · ${x.ret.toLocaleString()} retailers`,right:`${pct(x.a,x.t)}%`,status:pct(x.a,x.t)>=expected-5?"On track":"Behind"}))}/>
  <section className="section"><div className="quick-grid role-actions"><QuickAction href="/manager/attention" label="Attention" icon="target"/><QuickAction href="/manager/supervisors" label="Supervisors" icon="users"/><QuickAction href="/manager/rsos" label="RSO Performance" icon="chart"/><QuickAction href="/manager/bp-activations" label="BP Activations" icon="sim"/></div></section>
 </main>
}
