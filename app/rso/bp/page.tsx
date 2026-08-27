import Link from "next/link";
import {requirePagePermission} from "../../../lib/auth";
import {prisma} from "../../../lib/prisma";
import {monthBounds} from "../../../lib/month";
import {PageHead} from "../../components/RoleUI";
import {dhakaMonth} from "../../../lib/business-time";
import {withStandardGa} from "../../../lib/business-rules";
import {RsoSection} from "../../components/RsoUI";

export default async function Page(){
 const u=await requirePagePermission(["RSO"],"bp");
 if(!u.employeeId)return <main className="page rso-v7-page"><PageHead eyebrow="RSO" title="Account not mapped" subtitle="Ask Admin to link this login to an RSO employee."/></main>;
 const month=dhakaMonth()+"-01",{start,end}=monthBounds(month);
 const [current,history]=await Promise.all([
  prisma.bpAssignment.findFirst({where:{employeeId:u.employeeId,active:true},include:{retailer:{select:{retailerCode:true,retailerName:true,bpUser:{select:{displayName:true,mobileNumber:true,active:true,role:true}}}},monthlyTargets:{where:{month:start},take:1}}}),
  prisma.bpAssignment.findMany({where:{employeeId:u.employeeId,active:false},orderBy:{endDate:"desc"},take:8,include:{retailer:{select:{retailerCode:true,retailerName:true}}}})
 ]);

 if(!current)return <main className="page rso-v7-page">
  <section className="rso-v7-subhero bp">
   <div><div className="rso-v7-kicker">MY BP</div><h1>No active BP</h1><p>Admin has not selected a current BP retailer code under your RSO yet.</p></div>
   <div className="rso-v7-substat"><span>HISTORY</span><strong>{history.length}</strong><small>previous BP assignments</small></div>
  </section>
  <section className="rso-v7-section"><RsoSection eyebrow="PREVIOUS ASSIGNMENTS" title="BP history"/>
   <div className="rso-v7-history">{history.map(h=><div key={h.id}><strong>{h.retailer.retailerName||h.retailer.retailerCode}</strong><span>{h.retailer.retailerCode}</span><small>{h.startDate.toISOString().slice(0,10)} → {h.endDate?.toISOString().slice(0,10)||"Ended"}</small></div>)}</div>
  </section>
 </main>;

 const target=current.monthlyTargets[0]?.gaTarget??current.gaTarget;
 const ga=await prisma.gaActivation.count({where:withStandardGa({retailerId:current.retailerId,activationDate:{gte:start,lt:end}})});
 const progress=target?Math.round(ga/target*100):0;
 const login=current.retailer.bpUser?.active&&current.retailer.bpUser.role==="BP"?current.retailer.bpUser:null;

 return <main className="page rso-v7-page rso-bp-v7">
  <section className="rso-v7-bp-hero">
   <div className="rso-v7-bp-top">
    <div><div className="rso-v7-kicker">MY ACTIVE BP</div><h1>{current.retailer.retailerName||current.retailer.retailerCode}</h1><p>{current.retailer.retailerCode} · Active since {current.startDate.toISOString().slice(0,10)}</p></div>
    <span className="rso-v7-bp-badge">ACTIVE</span>
   </div>
   <div className="rso-v7-bp-progress">
    <div><small>MONTHLY GA</small><strong>{ga}<i> / {target}</i></strong><span>{Math.max(0,target-ga)} remaining</span></div>
    <div className="rso-v7-bp-ring"><b>{progress}%</b></div>
   </div>
   <div className="rso-v7-hero-progress"><i style={{width:`${Math.min(100,progress)}%`}}/></div>
  </section>

  <div className="rso-v7-bp-info">
   <div><span>BP CODE</span><strong>{current.retailer.retailerCode}</strong></div>
   <div><span>GA TARGET</span><strong>{target||"—"}</strong></div>
   <div><span>LOGIN</span><strong>{login?login.displayName:"Not created"}</strong><small>{login?.mobileNumber||"Admin can create login"}</small></div>
  </div>

  <Link href="/rso/bp/activations" className="rso-v7-bp-action"><div><strong>View BP Activation Details</strong><span>SIM sales, dates and activation records</span></div><b>›</b></Link>

  <section className="rso-v7-section"><RsoSection eyebrow="ASSIGNMENT HISTORY" title="Previous BP codes"/>
   <div className="rso-v7-history">{history.length?history.map(h=><div key={h.id}><strong>{h.retailer.retailerName||h.retailer.retailerCode}</strong><span>{h.retailer.retailerCode}</span><small>{h.startDate.toISOString().slice(0,10)} → {h.endDate?.toISOString().slice(0,10)||"Ended"}</small></div>):<div className="rso-v7-clear"><span>✓</span><div><strong>No previous BP codes</strong><small>This is the first recorded assignment.</small></div></div>}</div>
  </section>
 </main>
}