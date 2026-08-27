import {requirePagePermission} from "../../../lib/auth";
import {prisma} from "../../../lib/prisma";
import {monthBounds} from "../../../lib/month";
import {normalizeMonth} from "../../../lib/drilldown";
import {parseYmd,monthStartsInRange} from "../../../lib/date-range";
import {PageHead} from "../../components/RoleUI";
import {FilterForm} from "../../components/DrillUI";
import {classifyGaActivation,withGa170,withGa300,withSimSwap,withStandardGa} from "../../../lib/business-rules";
import {Icon} from "../../components/icons";

export default async function Page({searchParams}:{searchParams:Promise<{month?:string;q?:string;from?:string;to?:string}>}){
 const u=await requirePagePermission(["BP"],"ga");
 if(!u.bpRetailerId)return <main className="page bp-v8-page"><PageHead eyebrow="BP" title="BP code not assigned" subtitle="Ask Admin to link this login to an active BP retailer."/></main>;
 const s=await searchParams,month=normalizeMonth(s.from?.slice(0,7)||s.month),q=(s.q||"").trim(),{start,end}=monthBounds(`${month}-01`),rs=parseYmd(s.from)||start,to=parseYmd(s.to),re=to?new Date(to.getTime()+86400000):end;
 const [retailer,a]=await Promise.all([
  prisma.retailer.findUnique({where:{id:u.bpRetailerId},select:{retailerCode:true,retailerName:true}}),
  prisma.bpAssignment.findFirst({where:{retailerId:u.bpRetailerId,active:true},include:{monthlyTargets:{where:{month:{gte:new Date(Date.UTC(rs.getUTCFullYear(),rs.getUTCMonth(),1)),lt:new Date(Date.UTC(re.getUTCFullYear(),re.getUTCMonth()+1,1))}}}}})
 ]);
 if(!a)return <main className="page bp-v8-page"><PageHead eyebrow="BP" title="No active BP assignment" subtitle="Ask Admin to assign your BP retailer code."/></main>;
 const effectiveStart=a.startDate>rs?a.startDate:rs,aEnd=a.endDate?new Date(a.endDate.getTime()+86400000):re,effectiveEnd=aEnd<re?aEnd:re;
 const where={retailerId:u.bpRetailerId,activationDate:{gte:effectiveStart,lt:effectiveEnd},...(q?{simNo:{contains:q,mode:"insensitive" as const}}:{})};
 const rangeWhere={retailerId:u.bpRetailerId,activationDate:{gte:effectiveStart,lt:effectiveEnd}};
 // Total, 170 and 300 are counted in the database against the shared GA rules,
 // so the headline figures do not depend on the 300-row display slice.
 const [rows,total,ga150,ga300,simSwap]=await Promise.all([
  prisma.gaActivation.findMany({where,orderBy:[{activationDate:"desc"},{activationTime:"desc"}],take:300,select:{simNo:true,sellingPrice:true,productCode:true,activationDate:true,activationTime:true}}),
  prisma.gaActivation.count({where:withStandardGa(rangeWhere)}),
  prisma.gaActivation.count({where:withGa170(rangeWhere)}),
  prisma.gaActivation.count({where:withGa300(rangeWhere)}),
  prisma.gaActivation.count({where:withSimSwap(rangeWhere)})
 ]);
 const targetByMonth=new Map(a.monthlyTargets.map(x=>[x.month.toISOString().slice(0,7),x.gaTarget])),target=monthStartsInRange(effectiveStart,effectiveEnd).reduce((n,m)=>n+(targetByMonth.get(m.toISOString().slice(0,7))??a.gaTarget??0),0),progress=target?Math.min(100,Math.round(total/target*100)):0,remaining=Math.max(0,target-total);
 return <main className="page bp-v8-page bp-sales-v8">
  <section className="bp-v8-sales-hero"><div><div className="bp-v8-kicker">MY SIM SALES</div><h1>Activation Details</h1><p>{retailer?.retailerCode||""} · {retailer?.retailerName||"Your BP retailer"}</p></div><div className="bp-v8-sales-score"><small>GA</small><strong>{total}</strong><span>{target?`of ${target}`:"selected range"}</span></div></section>
  <div className="bp-v8-sales-progress"><div><span>Target progress</span><strong>{target?`${progress}%`:"Live"}</strong></div><div className="bp-v8-progress light"><i style={{width:`${progress}%`}}/></div><footer><span>{total} completed</span><span>{target?`${remaining} remaining`:"Target not set"}</span></footer></div>
  <div className="bp-v8-sales-stats"><div><span>170 GA</span><strong>{ga150}</strong><small>MMSTC</small></div><div><span>300 GA</span><strong>{ga300}</strong><small>MMST / MMSTS</small></div><div><span>SIM SWAP</span><strong>{simSwap}</strong><small>Not counted in GA</small></div></div>
  <div className="bp-v8-filter-wrap"><FilterForm q={q} month={month} from={s.from} to={s.to} dateRange placeholder="Search SIM serial"/></div>
  <section className="bp-v8-section"><div className="bp-v8-section-head"><div><span>SALES HISTORY</span><h2>SIM activations</h2><p>Only records inside your BP assignment and selected date range.</p></div><b>{rows.length} shown</b></div><div className="bp-v8-sales-list">
   {rows.length?rows.map(x=>{const category=classifyGaActivation(x);return <div className="bp-v8-sale-row" key={x.simNo}><span className="bp-v8-sim-icon"><Icon name="sim"/></span><div><strong>SIM {x.simNo}</strong><small>{x.activationDate.toISOString().slice(0,10)}{x.activationTime?` · ${x.activationTime}`:""}</small></div><div className="bp-v8-price"><strong>৳{Number(x.sellingPrice)}</strong><small>{category==="GA_170"?"170 GA":category==="GA_300"?"300 GA":category==="SIM_SWAP"?"SIM swap":"Not counted"}</small></div></div>}):<div className="bp-v8-empty"><span>0</span><div><strong>No GA found</strong><small>Change the date range or SIM search.</small></div></div>}
  </div></section>
 </main>
}