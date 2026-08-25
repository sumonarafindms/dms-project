import {requirePagePermission} from "../../../lib/auth";
import {prisma} from "../../../lib/prisma";
import {AccountsSection,AccountsStat} from "../../components/AccountsUI";

export default async function Page(){
 await requirePagePermission(["ACCOUNTS"],"employees");
 const [rsos,bps,supervisors]=await Promise.all([
  prisma.employee.findMany({where:{active:true},orderBy:{name:"asc"},select:{id:true,name:true,rsoMsisdn:true,employeeCode:true,_count:{select:{retailers:true}},supervisor:{select:{name:true}}}}),
  prisma.bpAssignment.findMany({where:{active:true},orderBy:{employee:{name:"asc"}},include:{employee:true,retailer:true,monthlyTargets:{orderBy:{month:"desc"},take:1}}}),
  prisma.supervisor.count({where:{active:true}})
 ]);
 return <main className="page accounts-v12-page accounts-people-v12">
  <section className="accounts-v12-subhero people"><div><div className="accounts-v12-kicker">FIELD REFERENCE</div><h1>RSO & BP Directory</h1><p>Reference the active field hierarchy while validating imports, targets and retailer ownership.</p></div><div className="accounts-v12-substat"><span>ACTIVE RSOS</span><strong>{rsos.length}</strong><small>{supervisors} supervisors · {bps.length} BPs</small></div></section>
  <div className="accounts-v12-stats compact"><AccountsStat label="RSOs" value={rsos.length} sub="Active employees" tone="blue"/><AccountsStat label="BP Assignments" value={bps.length} sub="Current retailer codes" tone="violet"/><AccountsStat label="Supervisors" value={supervisors} sub="Active hierarchy" tone="green"/></div>
  <section className="accounts-v12-section"><AccountsSection eyebrow="CURRENT BP MAPPING" title="Active BP assignments" sub="Retailer code, RSO ownership and current GA target."/><div className="accounts-v12-directory-grid">
   {bps.map(x=><article className="accounts-v12-person-card" key={x.id}><div className="accounts-v12-person-avatar bp">{(x.retailer.retailerName||x.retailer.retailerCode).slice(0,2).toUpperCase()}</div><div><span>{x.retailer.retailerCode}</span><strong>{x.retailer.retailerName||"BP"}</strong><small>RSO {x.employee.name} · Since {x.startDate.toISOString().slice(0,10)}</small></div><b>{x.monthlyTargets[0]?.gaTarget??x.gaTarget} GA</b></article>)}
   {!bps.length&&<div className="shared-empty-v9"><span>○</span><strong>No active BP assignments.</strong></div>}
  </div></section>
  <section className="accounts-v12-section"><AccountsSection eyebrow="ACTIVE RSO STRUCTURE" title="RSO reference" sub="Useful for employee mapping and retailer ownership checks."/><div className="accounts-v12-directory-grid">
   {rsos.map(x=><article className="accounts-v12-person-card" key={x.id}><div className="accounts-v12-person-avatar">{x.name.slice(0,2).toUpperCase()}</div><div><span>{x.employeeCode||x.rsoMsisdn}</span><strong>{x.name}</strong><small>{x.supervisor?.name||"Unassigned"} · {x.rsoMsisdn}</small></div><b>{x._count.retailers} outlets</b></article>)}
  </div></section>
 </main>
}