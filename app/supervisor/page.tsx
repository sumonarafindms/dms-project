import Link from "next/link";
import {requirePagePermission} from "../../lib/auth";
import {employeePerformance,pct} from "../../lib/performance";
import {retailerOpportunities} from "../../lib/retailer-opportunities";
import {prisma} from "../../lib/prisma";
import {latestDailySnapshot,monthPace,rankRows} from "../../lib/intelligence";
import {dhakaMonth} from "../../lib/business-time";
import {SupervisorHero,SupervisorKpi,SupervisorSection,SupervisorQuick} from "../components/SupervisorUI";
import {RankingList} from "../components/PerformanceIntelligence";
import {Icon} from "../components/icons";

export default async function Supervisor(){
 const u=await requirePagePermission(["SUPERVISOR"],"dashboard");
 const ids=u.supervisorId?(await prisma.employee.findMany({where:{supervisorId:u.supervisorId,active:true},select:{id:true}})).map(v=>v.id):[];
 const month=dhakaMonth()+"-01";
 const [rows,attentionRows,daily]=await Promise.all([employeePerformance(month,ids),retailerOpportunities(month,ids),latestDailySnapshot(ids)]);
 const attention=attentionRows.filter(x=>x.priority>0).length,retailers=rows.reduce((a,r)=>a+r.retailerCount,0),expected=monthPace(month);
 const sum=(k:keyof typeof rows[number])=>rows.reduce((a,r)=>a+Number(r[k]||0),0),ranked=rankRows(rows,expected);
 return <main className="page supervisor-v6-page">
  <SupervisorHero name={u.displayName} month={month} rsos={rows.length} retailers={retailers} attention={attention} expected={expected}/>
  <section className="supervisor-v6-live"><div><span><Icon name="sim"/></span><div><small>LATEST GA</small><strong>{daily.gaTotal.toLocaleString()}</strong><i>{daily.gaDate?daily.gaDate.toISOString().slice(0,10):"No recent data"}</i></div></div><b/><div><span><Icon name="wallet"/></span><div><small>LATEST C2C</small><strong>৳{Math.round(daily.c2cTotal).toLocaleString()}</strong><i>{daily.c2cDate?daily.c2cDate.toISOString().slice(0,10):"No recent data"}</i></div></div></section>

  <section className="supervisor-v6-section"><SupervisorSection eyebrow="TEAM TARGETS" title="Monthly execution" sub={`Expected pace is ${expected}% for this month.`}/><div className="supervisor-v6-kpis">
   <SupervisorKpi label="GA" value={sum("gaAchieved")} target={sum("gaTarget")} icon="sim"/>
   <SupervisorKpi label="C2C" value={sum("c2cAchieved")} target={sum("c2cTarget")} icon="wallet" unit="৳"/>
   <SupervisorKpi label="SSO" value={sum("ssoAchieved")} target={sum("ssoTarget")} icon="shop"/>
   <SupervisorKpi label="LSO" value={sum("lsoAchieved")} target={sum("lsoTarget")} icon="target"/>
  </div></section>

  <section className="supervisor-v6-main-grid"><div><SupervisorSection eyebrow="MY RSO TEAM" title="Performance ranking" sub="Highest composite pace appears first." href="/supervisor/rsos"/><div className="supervisor-v6-ranking"><RankingList title="" rows={ranked} base="/supervisor/rsos" month={month}/></div></div>
  <aside><SupervisorSection eyebrow="FIELD TOOLS" title="Quick actions"/><div className="supervisor-v6-actions">
   <SupervisorQuick href="/supervisor/attention" icon="target" title="Attention Queue" sub={`${attention} retailer follow-ups`}/>
   <SupervisorQuick href="/supervisor/rsos" icon="users" title="My RSOs" sub={`${rows.length} active team members`}/>
   <SupervisorQuick href="/supervisor/retailers" icon="shop" title="Retailers" sub={`${retailers.toLocaleString()} assigned outlets`}/>
   <SupervisorQuick href="/supervisor/bp-activations" icon="sim" title="BP Activations" sub="SIM activation monitoring"/>
  </div></aside></section>
 </main>
}