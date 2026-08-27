import {requirePagePermission} from "../../lib/auth";
import {employeePerformance} from "../../lib/performance";
import {PageHead} from "../components/RoleUI";
import {prisma} from "../../lib/prisma";
import {monthBounds} from "../../lib/month";
import {latestDailySnapshot,monthPace} from "../../lib/intelligence";
import {dhakaMonth} from "../../lib/business-time";
import {GA_CLASSIFICATION_SELECT,isLsoComplete,isSimSellerRetailer,isSsoComplete,lsoAmountRemaining,lsoTransactionsRemaining,ssoGaRemaining,summarizeGaActivations} from "../../lib/business-rules";
import {RsoHero,RsoKpi,RsoAction,RsoSection} from "../components/RsoUI";
import {Icon} from "../components/icons";

export default async function RSO(){
 const u=await requirePagePermission(["RSO"],"dashboard");
 if(!u.employeeId)return <main className="page rso-v7-page"><PageHead eyebrow="RSO" title="Account not mapped" subtitle="Ask Admin to link this login to an RSO employee record."/></main>;
 const month=dhakaMonth()+"-01",r=(await employeePerformance(month,[u.employeeId]))[0];if(!r)return null;
 const {start,end}=monthBounds(month),expected=monthPace(month);
 const [daily,retailers,bp]=await Promise.all([
  latestDailySnapshot([u.employeeId]),
  prisma.retailer.findMany({where:{employeeId:u.employeeId,active:true},select:{id:true,retailerCode:true,retailerName:true,simSeller:true,c2sMonthlySummaries:{where:{month:start},select:{totalAmount:true,transactionCount:true}},gaActivations:{where:{activationDate:{gte:start,lt:end}},select:{id:true,...GA_CLASSIFICATION_SELECT}}}}),
  prisma.bpAssignment.findFirst({where:{employeeId:u.employeeId,active:true},select:{id:true,retailer:{select:{retailerCode:true,retailerName:true}}}})
 ]);
 // GA here is standard GA only — replacement SIMs never satisfy an SSO gap.
 const attention=retailers.map(x=>{
  const summary=x.c2sMonthlySummaries[0],amount=Number(summary?.totalAmount||0),trx=summary?.transactionCount||0;
  const ga=summarizeGaActivations(x.gaActivations).total;
  return {x,amount,trx,ga,ssoPending:isSimSellerRetailer(x.simSeller)&&!isSsoComplete(x.simSeller,ga)};
 }).filter(v=>!isLsoComplete(v.amount,v.trx)||v.ssoPending).sort((a,b)=>Number(b.ssoPending)-Number(a.ssoPending));
 return <main className="page rso-v7-page">
  <RsoHero name={u.displayName} month={month} retailers={r.retailerCount} attention={attention.length} ga={r.gaAchieved} gaTarget={r.gaTarget} expected={expected}/>
  <section className="rso-v7-today"><div><span><Icon name="sim"/></span><div><small>LATEST GA</small><strong>{daily.gaTotal.toLocaleString()}</strong><i>{daily.gaDate?daily.gaDate.toISOString().slice(0,10):"No recent data"}</i></div></div><b/><div><span><Icon name="wallet"/></span><div><small>LATEST C2C</small><strong>৳{Math.round(daily.c2cTotal).toLocaleString()}</strong><i>{daily.c2cDate?daily.c2cDate.toISOString().slice(0,10):"No recent data"}</i></div></div></section>

  <section className="rso-v7-section"><RsoSection eyebrow="MY TARGETS" title="Sales progress" sub="Your monthly target completion at a glance."/><div className="rso-v7-kpis">
   <RsoKpi label="C2C" value={r.c2cAchieved} target={r.c2cTarget} icon="wallet" unit="৳"/>
   <RsoKpi label="Recharge" value={r.totalRechargeAchieved} target={r.totalRechargeTarget} icon="chart" unit="৳"/>
   <RsoKpi label="SSO" value={r.ssoAchieved} target={r.ssoTarget} icon="sim"/>
   <RsoKpi label="LSO" value={r.lsoAchieved} target={r.lsoTarget} icon="target"/>
  </div></section>

  <section className="rso-v7-section"><RsoSection eyebrow="QUICK ACTIONS" title="What do you need?"/><div className="rso-v7-actions">
   <RsoAction href="/rso/attention" icon="target" title="Retailer Focus" sub={`${attention.length} outlets need follow-up`} accent={attention.length>0}/>
   <RsoAction href="/rso/retailers" icon="shop" title="My Retailers" sub={`${r.retailerCount} assigned outlets`}/>
   <RsoAction href="/rso/bp" icon="users" title="My BP" sub={bp?`${bp.retailer.retailerName||bp.retailer.retailerCode}`:"No active BP"}/>
   <RsoAction href="/rso/bp/activations" icon="sim" title="BP Activations" sub="View SIM activation details"/>
  </div></section>

  <section className="rso-v7-section"><RsoSection eyebrow="FIELD FOLLOW-UP" title="Retailers to visit first" sub="Highest-impact SSO/LSO gaps from your own retailer base." href="/rso/attention" label="See all"/><div className="rso-v7-focus-list">
   {attention.slice(0,5).map(v=><a href={`/rso/retailers/${v.x.id}?month=${month.slice(0,7)}`} className="rso-v7-focus-card" key={v.x.id}><div className="rso-v7-focus-avatar">{(v.x.retailerName||v.x.retailerCode).slice(0,2).toUpperCase()}</div><div><strong>{v.x.retailerName||v.x.retailerCode}</strong><span>{v.x.retailerCode}</span><small>{v.ssoPending?`SSO: ${ssoGaRemaining(v.ga)} GA remaining`:`LSO: ৳${lsoAmountRemaining(v.amount).toLocaleString()} + ${lsoTransactionsRemaining(v.trx)} trx`}</small></div><b>›</b></a>)}
   {!attention.length&&<div className="rso-v7-clear"><span>✓</span><div><strong>No urgent retailer gaps</strong><small>Your current monthly retailer rules are on track.</small></div></div>}
  </div></section>
 </main>
}