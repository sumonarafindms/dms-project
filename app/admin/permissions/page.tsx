import Link from "next/link";
import {requireUser} from "../../../lib/auth";
import {prisma} from "../../../lib/prisma";
import PermissionBulkManager from "../../components/PermissionBulkManager";
export default async function Page(){
 await requireUser(["ADMIN"]);
 const users=await prisma.user.findMany({where:{role:{not:"ADMIN"}},orderBy:[{role:"asc"},{displayName:"asc"}],include:{_count:{select:{permissions:true}}}});
 const custom=users.filter(u=>u._count.permissions>0).length,defaults=users.length-custom;
 return <main className="page admin-permissions"><div className="admin-kicker">ACCESS CONTROL</div><h1>Permissions</h1><p className="permissions-sub">Control individual access, apply role presets, or copy an existing permission setup.</p>
 <div className="perf-summary"><div className="card perf-summary-card"><span>Login Users</span><strong>{users.length}</strong><small>Non-Admin accounts</small></div><div className="card perf-summary-card"><span>Role Default</span><strong>{defaults}</strong><small>No custom override</small></div><div className="card perf-summary-card"><span>Customized</span><strong>{custom}</strong><small>Individual access saved</small></div><div className="card perf-summary-card"><span>Roles</span><strong>{new Set(users.map(x=>x.role)).size}</strong><small>Active access groups</small></div></div>
 <PermissionBulkManager users={users.map(u=>({id:u.id,name:u.displayName,role:u.role,mobile:u.mobileNumber||"",custom:u._count.permissions}))}/>
 <section className="section"><div className="admin-section-head"><div><span>INDIVIDUAL ACCESS</span><h2>User permissions</h2></div></div><div className="card permission-user-list">{users.map(u=><Link href={`/admin/permissions/${u.id}`} key={u.id} className="permission-user-row"><div className="employee-avatar">{u.displayName.slice(0,2).toUpperCase()}</div><div><strong>{u.displayName}</strong><span>{u.role} · {u.mobileNumber||"No mobile"}</span></div><b>{u._count.permissions?`${u._count.permissions} custom`:"Role default"}</b><em>›</em></Link>)}</div></section></main>
}