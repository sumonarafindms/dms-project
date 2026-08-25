"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
type Row={key:string;label:string;group:string;view:boolean;add:boolean;edit:boolean;update:boolean};
export default function PermissionEditor({userId,name,role}:{userId:string;name:string;role:string}){
 const [rows,setRows]=useState<Row[]>([]),[busy,setBusy]=useState(true),[msg,setMsg]=useState("");
 useEffect(()=>{fetch(`/api/admin/permissions/${userId}`).then(r=>r.json()).then(d=>{setRows(d.modules||[]);setBusy(false)})},[userId]);
 function change(i:number,key:"view"|"add"|"edit"|"update",value:boolean){setRows(v=>v.map((r,n)=>n===i?{...r,[key]:value,...(key==="view"&&!value?{add:false,edit:false,update:false}:{})}:r))}
 function localPreset(type:"VIEW_ONLY"|"DATA_OPERATOR"|"FULL"){
  const writable=new Set(["retailers","targets","ga","c2c","c2s","ob","bp"]);
  setRows(v=>v.map(r=>type==="VIEW_ONLY"?{...r,view:true,add:false,edit:false,update:false}:type==="FULL"?{...r,view:true,add:true,edit:true,update:true}:writable.has(r.key)?{...r,view:true,add:true,edit:true,update:true}:{...r,view:true,add:false,edit:false,update:false}))
 }
 async function save(){setBusy(true);setMsg("");const r=await fetch(`/api/admin/permissions/${userId}`,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({permissions:rows.map(x=>({module:x.key,view:x.view,add:x.add,edit:x.edit,update:x.update}))})});setBusy(false);setMsg(r.ok?"Permissions saved.":"Could not save permissions.")}
 async function reset(){if(!confirm("Reset this user to role-default permissions?"))return;setBusy(true);await fetch(`/api/admin/permissions/${userId}`,{method:"DELETE"});location.reload()}
 return <main className="page admin-permissions"><div className="perf-breadcrumb"><span><Link href="/admin/permissions">Permissions</Link></span><span><b>›</b>{name}</span></div><div className="permission-head"><div><div className="admin-kicker">USER PERMISSIONS</div><h1>{name}</h1><p>{role} · Individual module access</p></div><Link className="btn btn-ghost" href="/admin/permissions">Back</Link></div>
 <div className="permission-legend card"><div><strong>How it works</strong><span>View controls visibility. Add, Edit and Update are only effective when View is enabled.</span></div><div className="permission-editor-presets"><button type="button" onClick={()=>localPreset("VIEW_ONLY")}>View Only</button><button type="button" onClick={()=>localPreset("DATA_OPERATOR")}>Data Operator</button><button type="button" onClick={()=>localPreset("FULL")}>Full Access</button></div></div>
 <div className="card permission-table"><div className="permission-row permission-header"><b>Module</b><span>View</span><span>Add</span><span>Edit</span><span>Update</span></div>{rows.map((r,i)=><div className="permission-row" key={r.key}><div><strong>{r.label}</strong><small>{r.group}</small></div>{(["view","add","edit","update"] as const).map(k=><label key={k}><input type="checkbox" checked={r[k]} disabled={busy||(k!=="view"&&!r.view)} onChange={e=>change(i,k,e.target.checked)}/><span/></label>)}</div>)}</div>
 <div className="permission-actions"><button className="btn admin-primary" disabled={busy} onClick={save}>{busy?"Loading / Saving...":"Save Permissions"}</button><button className="btn btn-ghost" disabled={busy} onClick={reset}>Reset to Role Default</button>{msg&&<span>{msg}</span>}</div></main>
}