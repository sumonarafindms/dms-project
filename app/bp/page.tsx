import {requirePagePermission} from "../../lib/auth";
import {prisma} from "../../lib/prisma";
import {monthBounds} from "../../lib/month";
import {PageHead} from "../components/RoleUI";
import {BpHero,BpInfo,BpAction} from "../components/BpUI";
import {dhakaMonth,dhakaTodayYmd} from "../../lib/business-time";
import {Icon} from "../components/icons";

export default async function BP(){
 const u=await requirePagePermission(["BP"],"dashboard");
 if(!u.bpRetailerId)return <main className="page bp-v8-page"><PageHead eyebrow="BP" title="BP code not assigned" subtitle="Ask Admin to link this login to an active BP retailer code."/></main>;
 const monthText=dhakaMonth()+"-01",{start,end}=monthBounds(monthText),dayStart=new Date(`${dhakaTodayYmd()}T00:00:00.000Z`),dayEnd=new Date(dayStart.getTime()+86400000);
 const [retailer,assignment]=await Promise.all([
  prisma.retailer.findUnique({where:{id:u.bpRetailerId},select:{retailerCode:true,retailerName:true,employee:{select:{name:true,rsoMsisdn:true,supervisor:{select:{name:true}}}}}}),
  prisma.bpAssignment.findFirst({where:{retailerId:u.bpRetailerId,active:true},include:{monthlyTargets:{where:{month:start},take:1},employee:{select:{name:true}}}})
 ]);
 if(!retailer)return <main className="page bp-v8-page"><PageHead eyebrow="BP" title="Retailer not found" subtitle="The BP retailer mapping needs to be updated."/></main>;
 if(!assignment)return <main className="page bp-v8-page"><PageHead eyebrow="BP" title="No active BP assignment" subtitle="Ask Admin to assign this retailer as an active BP."/></main>;
 const effectiveStart=assignment.startDate>start?assignment.startDate:start,assignmentEnd=assignment.endDate?new Date(assignment.endDate.getTime()+86400000):end,effectiveEnd=assignmentEnd<end?assignmentEnd:end,todayStart=dayStart>effectiveStart?dayStart:effectiveStart,todayEnd=dayEnd<effectiveEnd?dayEnd:effectiveEnd;
 const [monthlyGa,todayGa,recent]=await Promise.all([
  prisma.gaActivation.count({where:{retailerId:u.bpRetailerId,activationDate:{gte:effectiveStart,lt:effectiveEnd}}}),
  todayStart<todayEnd?prisma.gaActivation.count({where:{retailerId:u.bpRetailerId,activationDate:{gte:todayStart,lt:todayEnd}}}):Promise.resolve(0),
  prisma.gaActivation.findMany({where:{retailerId:u.bpRetailerId,activationDate:{gte:effectiveStart,lt:effectiveEnd}},orderBy:[{activationDate:"desc"},{activationTime:"desc"}],take:5,select:{simNo:true,sellingPrice:true,activationDate:true,activationTime:true}})
 ]);
 const target=assignment.monthlyTargets[0]?.gaTarget??assignment.gaTarget??0,remaining=Math.max(0,target-monthlyGa);
 return <main className="page bp-v8-page">
  <BpHero name={u.displayName} code={retailer.retailerCode} retailer={retailer.retailerName||"BP retailer"} today={todayGa} monthly={monthlyGa} target={target}/>
  <div className="bp-v8-info-grid">
   <BpInfo label="REMAINING" value={target?remaining:"—"} sub="Monthly GA" icon="target"/>
   <BpInfo label="MY RSO" value={retailer.employee?.name||"—"} sub={retailer.employee?.rsoMsisdn||"Not assigned"} icon="users"/>
   <BpInfo label="SUPERVISOR" value={retailer.employee?.supervisor?.name||"—"} sub="Reporting team" icon="users"/>
  </div>
  <section className="bp-v8-section"><div className="bp-v8-section-head"><div><span>QUICK ACTION</span><h2>Sales activity</h2></div></div><BpAction href="/bp/sales" title="Activation Details" sub="Search SIM serials and review your sales history"/></section>
  <section className="bp-v8-section"><div className="bp-v8-section-head"><div><span>LATEST SALES</span><h2>Recent activations</h2></div><a href="/bp/sales">View all ›</a></div><div className="bp-v8-recent">
   {recent.map(x=><div key={x.simNo}><span className="bp-v8-sim-icon"><Icon name="sim"/></span><div><strong>SIM {x.simNo}</strong><small>{x.activationDate.toISOString().slice(0,10)}{x.activationTime?` · ${x.activationTime}`:""}</small></div><div className="bp-v8-price"><strong>৳{Number(x.sellingPrice)}</strong><small>{Number(x.sellingPrice)===170?"150":"300"}</small></div></div>)}
   {!recent.length&&<div className="bp-v8-empty"><span>0</span><div><strong>No activations yet</strong><small>Your latest SIM sales will appear here.</small></div></div>}
  </div></section>
 </main>
}
