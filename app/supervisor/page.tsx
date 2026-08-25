import {requireUser} from "../../lib/auth";
import {employeePerformance,pct} from "../../lib/performance";
import {PageHead,Metric,ProgressCard,QuickAction} from "../components/RoleUI";
import {AttentionHero} from "../components/RoleAttention";
import {retailerOpportunities} from "../../lib/retailer-opportunities";
import {prisma} from "../../lib/prisma";
import {latestDailySnapshot,monthPace,rankRows} from "../../lib/intelligence";
import {DailyStrip,RankingList} from "../components/PerformanceIntelligence";

export default async function Supervisor(){
 const u=await requireUser(["SUPERVISOR"]);
 const ids=u.supervisorId?(await prisma.employee.findMany({where:{supervisorId:u.supervisorId,active:true},select:{id:true}})).map(v=>v.id):[];
 const month=new Date().toISOString().slice(0,7)+"-01";
 const [rows,attentionRows,daily]=await Promise.all([employeePerformance(month,ids),retailerOpportunities(month,ids),latestDailySnapshot(ids)]);
 const attention=attentionRows.filter(x=>x.priority>0).length,ret=rows.reduce((a,r)=>a+r.retailerCount,0);
 const sum=(k:keyof typeof rows[number])=>rows.reduce((a,r)=>a+Number(r[k]||0),0),expected=monthPace(month),ranked=rankRows(rows,expected);
 return <main className="page">
  <PageHead eyebrow="Supervisor" title={`Hello, ${u.displayName}`} subtitle={`Your team only · ${expected}% of the month elapsed.`}/>
  <AttentionHero count={attention} href="/supervisor/attention"/>
  <DailyStrip ga={daily.gaTotal} gaDate={daily.gaDate} c2c={daily.c2cTotal} c2cDate={daily.c2cDate}/>
  <div className="role-metric-grid"><Metric label="My RSOs" value={rows.length} sub="Active" icon="users"/><Metric label="Retailers" value={ret.toLocaleString()} sub="Assigned outlets" icon="shop"/><Metric label="LSO Complete" value={sum("lsoAchieved")} sub={`${pct(sum("lsoAchieved"),sum("lsoTarget"))}% of target`} icon="target"/></div>
  <section className="section"><div className="section-head"><h2 className="section-title">Team target pace</h2><span className="section-link">Expected {expected}%</span></div><div className="progress-grid"><ProgressCard title="GA" value={sum("gaAchieved")} target={sum("gaTarget")}/><ProgressCard title="C2C" value={sum("c2cAchieved")} target={sum("c2cTarget")} unit="৳"/><ProgressCard title="SSO" value={sum("ssoAchieved")} target={sum("ssoTarget")}/></div></section>
  <RankingList title="My RSO ranking" rows={ranked} base="/supervisor/rsos" month={month}/>
  <section className="section"><div className="quick-grid role-actions"><QuickAction href="/supervisor/attention" label="Attention" icon="target" module="attention"/><QuickAction href="/supervisor/rsos" label="My RSOs" icon="users" module="employees"/><QuickAction href="/supervisor/retailers" label="Retailers" icon="shop" module="retailers"/><QuickAction href="/supervisor/bp-activations" label="BP Activations" icon="sim" module="bp"/></div></section>
 </main>
}
