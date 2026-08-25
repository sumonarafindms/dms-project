import Link from "next/link";
import {requirePagePermission} from "../../lib/auth";
import {employeePerformance} from "../../lib/performance";
import {prisma} from "../../lib/prisma";
import {retailerOpportunities} from "../../lib/retailer-opportunities";
import {latestDailySnapshot,monthPace,rankRows} from "../../lib/intelligence";
import {managerScope} from "../../lib/manager-scope";
import {dhakaMonth} from "../../lib/business-time";
import {ManagerHero,ManagerMetric,ManagerSectionHead,ManagerSupervisorCards} from "../components/ManagerUI";
import {RankingList} from "../components/PerformanceIntelligence";
import {Icon} from "../components/icons";

export default async function Manager(){
 const u=await requirePagePermission(["MANAGER"],"dashboard");
 const scope=await managerScope(u.id),month=dhakaMonth()+"-01";
 const [rows,attentionRows,supervisors,daily]=await Promise.all([
  employeePerformance(month,scope.employeeIds),
  retailerOpportunities(month,scope.employeeIds),
  prisma.supervisor.findMany({where:{active:true,id:{in:scope.supervisorIds}},select:{id:true,name:true},orderBy:{name:"asc"}}),
  latestDailySnapshot(scope.employeeIds)
 ]);
 const attention=attentionRows.filter(x=>x.priority>0).length,retailers=rows.reduce((a,r)=>a+r.retailerCount,0),expected=monthPace(month);
 const sum=(k:keyof typeof rows[number])=>rows.reduce((a,r)=>a+Number(r[k]||0),0),ranked=rankRows(rows,expected);
 const supBy=new Map<string,{id:string;name:string;rsos:number;retailers:number;achieved:number;target:number}>();
 for(const s of supervisors)supBy.set(s.name,{id:s.id,name:s.name,rsos:0,retailers:0,achieved:0,target:0});
 for(const r of rows){const x=supBy.get(r.supervisor);if(x){x.rsos++;x.retailers+=r.retailerCount;x.achieved+=r.totalRechargeAchieved;x.target+=r.totalRechargeTarget}}
 return <main className="page manager-v5-page">
  <ManagerHero name={u.displayName} month={month} supervisors={supervisors.length} rsos={rows.length} retailers={retailers} attention={attention} expected={expected}/>
  <section className="manager-v5-live-strip"><div><span className="manager-v5-live-icon"><Icon name="sim"/></span><div><small>LATEST GA</small><strong>{daily.gaTotal.toLocaleString()}</strong><span>{daily.gaDate?daily.gaDate.toISOString().slice(0,10):"No recent data"}</span></div></div><i/><div><span className="manager-v5-live-icon"><Icon name="wallet"/></span><div><small>LATEST C2C</small><strong>৳{Math.round(daily.c2cTotal).toLocaleString()}</strong><span>{daily.c2cDate?daily.c2cDate.toISOString().slice(0,10):"No recent data"}</span></div></div></section>

  <section className="manager-v5-section"><ManagerSectionHead eyebrow="MONTHLY EXECUTION" title="Target progress" sub={`Expected pace is ${expected}% for the current month.`}/><div className="manager-v5-metrics">
   <ManagerMetric label="GA" value={sum("gaAchieved")} target={sum("gaTarget")} icon="sim"/>
   <ManagerMetric label="C2C" value={sum("c2cAchieved")} target={sum("c2cTarget")} icon="wallet" unit="৳"/>
   <ManagerMetric label="Total Recharge" value={sum("totalRechargeAchieved")} target={sum("totalRechargeTarget")} icon="chart" unit="৳"/>
   <ManagerMetric label="LSO" value={sum("lsoAchieved")} target={sum("lsoTarget")} icon="target"/>
  </div></section>

  <section className="manager-v5-main-grid">
   <div><ManagerSectionHead eyebrow="RSO PERFORMANCE" title="Team ranking" sub="Composite pace based on GA and recharge execution." href="/manager/rsos" label="All RSOs"/><div className="manager-v5-ranking"><RankingList title="" rows={ranked.slice(0,8)} base="/manager/rsos" month={month}/></div></div>
   <aside><ManagerSectionHead eyebrow="QUICK ACCESS" title="Monitoring tools"/><div className="manager-v5-actions">
    <Link href="/manager/attention"><span><Icon name="target"/></span><div><strong>Attention Center</strong><small>{attention} retailers need review</small></div><b>›</b></Link>
    <Link href="/manager/supervisors"><span><Icon name="users"/></span><div><strong>Supervisors</strong><small>Assigned team overview</small></div><b>›</b></Link>
    <Link href="/manager/rsos"><span><Icon name="chart"/></span><div><strong>RSO Performance</strong><small>Field execution ranking</small></div><b>›</b></Link>
    <Link href="/manager/bp-activations"><span><Icon name="sim"/></span><div><strong>BP Activations</strong><small>SIM activation monitoring</small></div><b>›</b></Link>
   </div></aside>
  </section>

  <section className="manager-v5-section"><ManagerSectionHead eyebrow="TEAM STRUCTURE" title="Supervisor performance" sub="Recharge execution across your assigned teams." href="/manager/supervisors"/><ManagerSupervisorCards items={[...supBy.values()]} expected={expected}/></section>
 </main>
}