import {requireUser} from "../../lib/auth";
import {prisma} from "../../lib/prisma";
import {monthBounds} from "../../lib/month";
import {PageHead,Metric,QuickAction} from "../components/RoleUI";
export default async function BP(){
 const u=await requireUser(["BP"]);if(!u.bpRetailerId)return <main className="page field-page"><PageHead eyebrow="BP" title="BP code not assigned" subtitle="Ask Admin to link this login to an active BP retailer code."/></main>;
 const monthText=new Date().toISOString().slice(0,7)+"-01";const {start,end}=monthBounds(monthText);const today=new Date();const dayStart=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate()));const dayEnd=new Date(dayStart.getTime()+86400000);
 const [retailer,assignment]=await Promise.all([
  prisma.retailer.findUnique({where:{id:u.bpRetailerId},select:{retailerCode:true,retailerName:true,employee:{select:{name:true,rsoMsisdn:true,supervisor:{select:{name:true}}}}}}),
  prisma.bpAssignment.findFirst({where:{retailerId:u.bpRetailerId,active:true},select:{gaTarget:true,startDate:true,endDate:true,employee:{select:{name:true}}}}),
 ]);
 if(!retailer)return <main className="page field-page"><PageHead eyebrow="BP" title="Retailer not found" subtitle="The BP retailer mapping needs to be updated."/></main>;
 if(!assignment)return <main className="page field-page"><PageHead eyebrow="BP" title="No active BP assignment" subtitle="Ask Admin to assign this retailer as an active BP."/></main>;
 const effectiveStart=assignment.startDate>start?assignment.startDate:start;const assignmentEnd=assignment.endDate?new Date(assignment.endDate.getTime()+86400000):end;const effectiveEnd=assignmentEnd<end?assignmentEnd:end;const todayStart=dayStart>effectiveStart?dayStart:effectiveStart;const todayEnd=dayEnd<effectiveEnd?dayEnd:effectiveEnd;
 const [monthlyGa,todayGa]=await Promise.all([
  prisma.gaActivation.count({where:{retailerId:u.bpRetailerId,activationDate:{gte:effectiveStart,lt:effectiveEnd}}}),
  todayStart<todayEnd?prisma.gaActivation.count({where:{retailerId:u.bpRetailerId,activationDate:{gte:todayStart,lt:todayEnd}}}):Promise.resolve(0),
 ]);
 const target=assignment.gaTarget||0,remaining=Math.max(0,target-monthlyGa),progress=target?Math.min(100,Math.round(monthlyGa/target*100)):0;
 return <main className="page field-page bp-page"><PageHead eyebrow="SIM Sales" title={`Hello, ${u.displayName}`} subtitle={`${retailer.retailerCode} · ${retailer.retailerName||"BP retailer"}${retailer.employee?` · RSO ${retailer.employee.name}`:""}`}/><div className="bp-primary card"><div className="bp-label">GA Completed</div><div className="bp-number">{monthlyGa}</div><div className="bp-target">{target?`of ${target} monthly target`:`Monthly target not set`}</div><div className="progress bp-progress"><span style={{width:`${progress}%`}}/></div><div className="bp-progress-foot"><strong>{target?`${progress}%`:"Live"}</strong><span>{target?`${remaining} remaining`:"Set target from BP Management"}</span></div></div><div className="role-metric-grid compact"><Metric label="Today GA" value={todayGa} sub="Current day" icon="sim"/><Metric label="Remaining" value={target?remaining:"—"} sub="Monthly" icon="target"/><Metric label="RSO" value={retailer.employee?.name||"—"} sub={retailer.employee?.rsoMsisdn||"Not assigned"} icon="users"/></div><section className="section"><div className="quick-grid field-actions"><QuickAction href="/bp/sales" label="Activation Details" icon="sim"/></div></section></main>
}
