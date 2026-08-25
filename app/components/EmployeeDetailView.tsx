import Link from "next/link";
import {PageHead,ProgressCard,Metric} from "./RoleUI";
import {FilterForm,LinkedList} from "./DrillUI";
import {pct} from "../../lib/performance";
export function EmployeeDetailView({d,month,basePath,backHref,q=""}:{d:any;month:string;basePath:string;backHref:string;q?:string}){
 const p=d.perf;const filtered=d.retailers.filter((r:any)=>!q||`${r.retailerCode} ${r.retailerName||""} ${r.category||""} ${r.route||""}`.toLowerCase().includes(q.toLowerCase()));
 return <main className="page"><PageHead eyebrow="RSO Detail" title={d.employee.name} subtitle={`${d.employee.employeeCode||d.employee.rsoMsisdn} · ${d.employee.supervisor?.name||"Unassigned supervisor"}`} action={<Link href={backHref} className="btn btn-ghost">Back</Link>}/>
 <div className="role-metric-grid"><Metric label="Retailers" value={p.retailerCount} sub="Assigned" icon="shop"/><Metric label="SSO" value={`${p.ssoAchieved}/${p.ssoTarget}`} sub={`${pct(p.ssoAchieved,p.ssoTarget)}% complete`} icon="sim"/><Metric label="LSO" value={`${p.lsoAchieved}/${p.lsoTarget}`} sub={`${pct(p.lsoAchieved,p.lsoTarget)}% complete`} icon="target"/></div>
 <section className="section"><div className="progress-grid"><ProgressCard title="GA" value={p.gaAchieved} target={p.gaTarget}/><ProgressCard title="C2C" value={Math.round(p.c2cAchieved)} target={Math.round(p.c2cTarget)} unit="৳"/><ProgressCard title="Total Recharge" value={Math.round(p.totalRechargeAchieved)} target={Math.round(p.totalRechargeTarget)} unit="৳"/></div></section>
 <FilterForm q={q} month={month} placeholder="Search this RSO's retailers"/>
 <LinkedList title={`Retailers (${filtered.length})`} items={filtered.map((r:any)=>({href:`${basePath}/retailers/${r.id}?month=${month}`,name:r.retailerName||r.retailerCode,meta:`${r.retailerCode}${r.isBp?" · BP":""}${(r.simSeller||"").toUpperCase()==="Y"?" · SIM Seller":""}`,right:`GA ${r.ga}`,status:`${r.lso?"LSO ✓":"LSO pending"} · ৳${Math.round(r.c2cAmount).toLocaleString()}`}))}/>
 </main>
}
