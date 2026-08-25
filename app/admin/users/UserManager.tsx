"use client";
import {FormEvent,useState} from "react";
import {useRouter} from "next/navigation";
import ConfirmActionButton from "../../components/ConfirmActionButton";
import StatusToast from "../../components/StatusToast";
type Opt={id:string;name:string;meta?:string};type U={id:string;displayName:string;mobileNumber:string|null;role:string;active:boolean;link:string};
export default function UserManager({users,employees,supervisors,bps}:{users:U[];employees:Opt[];supervisors:Opt[];bps:Opt[]}){
 const router=useRouter(),[role,setRole]=useState("RSO"),[msg,setMsg]=useState(""),[msgTone,setMsgTone]=useState<"success"|"error">("success"),[q,setQ]=useState("");
 async function create(e:FormEvent<HTMLFormElement>){e.preventDefault();setMsg("");setMsgTone("success");const f=new FormData(e.currentTarget);const body:any=Object.fromEntries(f);body.role=role;const r=await fetch("/api/admin/users",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});const d=await r.json();if(!r.ok){setMsgTone("error");return setMsg(d.error||"Could not create user")}setMsgTone("success");setMsg("User created successfully.");(e.currentTarget as HTMLFormElement).reset();router.refresh()}
 async function toggle(id:string,active:boolean){await fetch("/api/admin/users",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id,active})});router.refresh()}
 const filtered=users.filter(u=>!q||`${u.displayName} ${u.mobileNumber||""} ${u.role} ${u.link}`.toLowerCase().includes(q.toLowerCase()));
 return <div className="users-v3-grid">
  <section className="users-v3-create">
   <div className="users-v3-card-head"><div><span>NEW LOGIN</span><h2>Create authorized account</h2><p>Mobile + PIN access linked to the correct DMS role.</p></div><b>{role}</b></div>
   <form className="user-v3-form" onSubmit={create}>
    <label><span>ROLE</span><select value={role} onChange={e=>setRole(e.target.value)}>{["IT","MANAGER","SUPERVISOR","ACCOUNTS","RSO","BP"].map(x=><option key={x}>{x}</option>)}</select></label>
    <label><span>DISPLAY NAME</span><input name="displayName" required/></label>
    <label><span>MOBILE NUMBER</span><input name="mobileNumber" required inputMode="tel"/></label>
    <label><span>PIN</span><input name="pin" required minLength={4} inputMode="numeric" type="password"/></label>
    {role==="RSO"&&<label className="user-v3-wide"><span>LINK RSO EMPLOYEE</span><select name="employeeId" required><option value="">Select RSO</option>{employees.map(x=><option key={x.id} value={x.id}>{x.name} · {x.meta}</option>)}</select></label>}
    {role==="SUPERVISOR"&&<label className="user-v3-wide"><span>LINK SUPERVISOR</span><select name="supervisorId" required><option value="">Select supervisor</option>{supervisors.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
    {role==="BP"&&<label className="user-v3-wide"><span>LINK ASSIGNED BP RETAILER</span><select name="bpRetailerId" required><option value="">Select active BP</option>{bps.map(x=><option key={x.id} value={x.id}>{x.name} · {x.meta}</option>)}</select></label>}
    <button className="btn admin-primary user-v3-submit">Create Login</button>
   </form>
   {msg&&<StatusToast message={msg} tone={msgTone}/>}
   <div className="user-v3-help"><strong>Access safety</strong><span>PIN resets and deactivation revoke active sessions automatically.</span></div>
  </section>

  <section className="users-v3-directory">
   <div className="users-v3-directory-head"><div><span>AUTHORIZED USERS</span><h2>Login Accounts</h2><p>{users.filter(u=>u.active).length} active · {users.filter(u=>!u.active).length} disabled</p></div><div className="users-v3-search"><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search users"/></div></div>
   <div className="users-v3-list">{filtered.map(u=><article className="user-v3-row" key={u.id}><div className="user-v3-avatar">{u.displayName.slice(0,2).toUpperCase()}</div><div className="user-v3-main"><strong>{u.displayName}</strong><span>{u.role} · {u.mobileNumber||"Admin login"}</span><small>{u.link||"System account"}</small></div><ConfirmActionButton className={`user-v3-status ${u.active?"active":"disabled"}`} message={u.active?`Disable login for ${u.displayName}? Active sessions will be revoked.`:`Enable login for ${u.displayName}?`} onConfirm={()=>toggle(u.id,!u.active)}><i/>{u.active?"Active":"Disabled"}</ConfirmActionButton></article>)}{!filtered.length&&<div className="admin-empty"><strong>No matching accounts</strong></div>}</div>
  </section>
 </div>
}