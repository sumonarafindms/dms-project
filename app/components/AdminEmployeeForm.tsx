"use client";
import {FormEvent,useMemo,useState} from "react";
import type {ReactNode} from "react";
import {useRouter} from "next/navigation";
import Link from "next/link";
import {SaveNotice} from "./AdminEmployeesUI";
import {dhakaTodayYmd} from "../../lib/business-time";

type Option={id:string;name:string;meta?:string;employeeId?:string};
type Initial={
 id?:string;name?:string;mobile?:string;active?:boolean;rsoMsisdn?:string;employeeCode?:string;
 supervisorId?:string;employeeId?:string;retailerId?:string;startDate?:string;gaTarget?:number;
};
export default function AdminEmployeeForm({role,initial={},supervisors=[],employees=[],retailers=[]}:{role:"managers"|"supervisors"|"rsos"|"bps";initial?:Initial;supervisors?:Option[];employees?:Option[];retailers?:Option[]}){
 const router=useRouter(),edit=Boolean(initial.id);
 const [employeeId,setEmployeeId]=useState(initial.employeeId||"");
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[ok,setOk]=useState(false);
 const availableRetailers=useMemo(()=>retailers.filter(r=>!employeeId||r.employeeId===employeeId),[retailers,employeeId]);
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setBusy(true);setMessage("");setOk(false);
  const fd=new FormData(e.currentTarget),body:any=Object.fromEntries(fd.entries());body.active=fd.get("active")==="on";if(edit)body.id=initial.id;
  const r=await fetch(`/api/admin/employees/${role}`,{method:edit?"PATCH":"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
  const d=await r.json();setBusy(false);if(!r.ok){setMessage(d.error||"Could not save");return}setOk(true);setMessage(edit?"Changes saved successfully.":"Employee created successfully.");
  if(!edit&&d.id){router.push(`/admin/employees/${role}/${d.id}`);router.refresh()}else router.refresh();
 }
 const title=role==="managers"?"Manager":role==="supervisors"?"Supervisor":role==="rsos"?"RSO":"BP";
 return <main className="page admin-employee-form-page"><div className="perf-breadcrumb"><span><Link href="/admin/employees">Employees</Link></span><span><b>›</b><Link href={`/admin/employees/${role}`}>{title}</Link></span><span><b>›</b>{edit?"Edit":"Add New"}</span></div>
 <div className="employee-form-head"><div><div className="admin-kicker">{edit?"EDIT EMPLOYEE":"NEW EMPLOYEE"}</div><h1>{edit?`Edit ${title}`:`Add ${title}`}</h1><p>{role==="bps"?"Assign a retailer code under an RSO and optionally create the BP mobile login.":"Manage employee identity, hierarchy and login access."}</p></div><Link href={`/admin/employees/${role}`} className="btn btn-ghost">Back</Link></div>
 <div className="employee-form-layout"><form onSubmit={submit} className="card employee-form employee-v3-form">
  {role!=="bps"&&<Field label={`${title} Name`}><input className="control" name="name" required defaultValue={initial.name||""}/></Field>}
  {role==="rsos"&&<><Field label="RSO MSISDN"><input className="control" name="rsoMsisdn" required defaultValue={initial.rsoMsisdn||""} inputMode="numeric"/></Field><Field label="Employee / RSO Code"><input className="control" name="employeeCode" defaultValue={initial.employeeCode||""}/></Field><Field label="Supervisor"><select className="control" name="supervisorId" defaultValue={initial.supervisorId||""}><option value="">Unassigned</option>{supervisors.map(x=><option value={x.id} key={x.id}>{x.name}</option>)}</select></Field></>}
  {role==="bps"&&<>{!edit?<><Field label="RSO"><select className="control" name="employeeId" required value={employeeId} onChange={e=>setEmployeeId(e.target.value)}><option value="">Select RSO</option>{employees.map(x=><option key={x.id} value={x.id}>{x.name}{x.meta?` · ${x.meta}`:""}</option>)}</select></Field><Field label="Retailer Code"><select className="control" name="retailerId" required defaultValue={initial.retailerId||""}><option value="">Select retailer</option>{availableRetailers.map(x=><option key={x.id} value={x.id}>{x.name}{x.meta?` · ${x.meta}`:""}</option>)}</select></Field><Field label="Effective From"><input className="control" type="date" name="startDate" required defaultValue={initial.startDate||dhakaTodayYmd()}/></Field></>:<Field label="BP Assignment"><div className="employee-readonly">{initial.name||"Current BP assignment"}<span>To change retailer code, create a new BP assignment.</span></div></Field>}<Field label="BP GA Target"><input className="control" type="number" min="0" name="gaTarget" defaultValue={initial.gaTarget||0}/></Field><Field label="BP Display Name"><input className="control" name="name" defaultValue={initial.name||""}/></Field></>}
  <div className="employee-form-divider"><span>Login & Access</span></div>
  <Field label="Mobile Number"><input className="control" name="mobile" defaultValue={initial.mobile||""} inputMode="tel" placeholder={edit?"Keep current or enter a new number":"Optional for Supervisor/RSO/BP"}/></Field>
  <Field label={edit?"New PIN (optional)":"PIN"}><input className="control" name="pin" type="password" inputMode="numeric" minLength={4} placeholder={edit?"Leave blank to keep current PIN":"Minimum 4 characters"} required={role==="managers"&&!edit}/></Field>
  <label className="employee-active-toggle"><input type="checkbox" name="active" defaultChecked={initial.active!==false}/><span><strong>Active</strong><small>User can be assigned and access the DMS when a login exists.</small></span></label>
  <SaveNotice message={message} ok={ok}/>
  <div className="employee-form-actions"><button className="btn admin-primary" disabled={busy}>{busy?"Saving...":edit?"Save Changes":`Create ${title}`}</button><Link className="btn btn-ghost" href={`/admin/employees/${role}`}>Cancel</Link></div>
 </form><aside className="employee-v3-aside"><div className="employee-v3-guide"><span>SETUP GUIDE</span><strong>{title} configuration</strong><p>{role==="bps"?"BP is tied to a retailer code and RSO assignment. Use a new assignment when the BP code changes.":"Keep hierarchy and login data aligned so role dashboards show the correct team."}</p><div><b>1</b><span>Confirm identity and hierarchy</span></div><div><b>2</b><span>Add mobile + PIN only when login is required</span></div><div><b>3</b><span>Review active status before saving</span></div></div><div className="employee-v3-security"><strong>Access protection</strong><span>Changing a PIN or disabling an account revokes active sessions.</span></div></aside></div></main>
}
function Field({label,children}:{label:string;children:ReactNode}){return <label className="employee-field"><span>{label}</span>{children}</label>}
