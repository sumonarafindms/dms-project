import {requireUser} from "../../../lib/auth";
import {prisma} from "../../../lib/prisma";
import {monthBounds} from "../../../lib/month";
import {normalizeMonth} from "../../../lib/drilldown";
import {PageHead,ProgressCard} from "../../components/RoleUI";
import {FilterForm} from "../../components/DrillUI";
export default async function Page({searchParams}:{searchParams:Promise<{month?:string;q?:string}>}){
 const u=await requireUser(["BP"]);if(!u.bpRetailerId)return <main className="page field-page"><PageHead eyebrow="BP" title="BP code not assigned" subtitle="Ask Admin to link this login to an active BP retailer."/></main>;
 const s=await searchParams,month=normalizeMonth(s.month),q=(s.q||"").trim(),{start,end}=monthBounds(`${month}-01`);
 const [retailer,a]=await Promise.all([
  prisma.retailer.findUnique({where:{id:u.bpRetailerId},select:{retailerCode:true,retailerName:true}}),
  prisma.bpAssignment.findFirst({where:{retailerId:u.bpRetailerId,active:true},select:{gaTarget:true,startDate:true,endDate:true}})
 ]);
 if(!a)return <main className="page field-page"><PageHead eyebrow="BP" title="No active BP assignment" subtitle="Ask Admin to assign your BP retailer code."/></main>;
 const effectiveStart=a.startDate>start?a.startDate:start;const aEnd=a.endDate?new Date(a.endDate.getTime()+86400000):end;const effectiveEnd=aEnd<end?aEnd:end;
 const where={retailerId:u.bpRetailerId,activationDate:{gte:effectiveStart,lt:effectiveEnd},...(q?{simNo:{contains:q,mode:"insensitive" as const}}:{})};
 const [rows,total]=await Promise.all([
  prisma.gaActivation.findMany({where,orderBy:[{activationDate:"desc"},{activationTime:"desc"}],take:300,select:{simNo:true,sellingPrice:true,activationDate:true,activationTime:true}}),
  prisma.gaActivation.count({where:{retailerId:u.bpRetailerId,activationDate:{gte:effectiveStart,lt:effectiveEnd}}})
 ]);
 const target=a.gaTarget||0;
 return <main className="page field-page"><PageHead eyebrow="BP" title="Activation details" subtitle={`${retailer?.retailerCode||""} · ${retailer?.retailerName||"Your BP retailer"}`}/><div className="progress-grid"><ProgressCard title="Monthly GA" value={total} target={target}/></div><div className="info-banner"><div className="info-dot"/><div>Only activations from your current BP assignment period are counted.</div></div><FilterForm q={q} month={month} placeholder="Search SIM serial"/><section className="section"><div className="section-head"><h2 className="section-title">GA history</h2><span className="section-link">{rows.length} shown</span></div><div className="card panel activity-list">{rows.length?rows.map(x=><div className="activity-row" key={x.simNo}><div><div className="activity-date">SIM {x.simNo}</div><div className="activity-meta">{x.activationDate.toISOString().slice(0,10)}{x.activationTime?` · ${x.activationTime}`:""}</div></div><div className="activity-value">৳{Number(x.sellingPrice)}<div className="mini-label">{Number(x.sellingPrice)===170?"150":"300"}</div></div></div>):<div className="empty">No GA found for this filter.</div>}</div></section></main>
}
