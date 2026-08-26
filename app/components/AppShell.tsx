"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {Icon} from "./icons";
import {PermissionProvider,type ClientPermissionMap} from "./PermissionContext";

type NavItem={href:string;label:string;icon:string;module?:string};
type RoleConfig={name:string;title:string;initials:string;home:string;nav:NavItem[];bottom:NavItem[]};
const adminNav:NavItem[]=[
 {href:"/dashboard",label:"Dashboard",icon:"home",module:"dashboard"},
 {href:"/admin/performance/supervisors",label:"Supervisor Performance",icon:"users",module:"performance"},
 {href:"/admin/performance/rsos",label:"RSO Performance",icon:"chart",module:"performance"},
 {href:"/admin/performance/bps",label:"BP Performance",icon:"sim",module:"performance"},
 {href:"/admin/performance/retailers",label:"Retailer Performance",icon:"shop",module:"performance"},
 {href:"/admin/upload",label:"Upload Center",icon:"upload",module:"ga"},
 {href:"/ga",label:"GA Upload",icon:"sim",module:"ga"},
 {href:"/c2c",label:"C2C Upload",icon:"wallet",module:"c2c"},
 {href:"/c2s",label:"C2S Upload",icon:"chart",module:"c2s"},
 {href:"/ob",label:"OB Upload",icon:"balance",module:"ob"},
 {href:"/admin/upload/retailers",label:"Retailer List",icon:"shop",module:"retailers"},
 {href:"/admin/employees",label:"Employees",icon:"users",module:"employees"},
 {href:"/admin/permissions",label:"Permissions",icon:"target",module:"employees"},
 {href:"/admin/audit",label:"Activity Log",icon:"chart",module:"employees"},
 {href:"/targets",label:"Targets",icon:"target",module:"targets"},
 {href:"/admin/attention",label:"Attention Center",icon:"target",module:"attention"},
];
const configs:Record<string,RoleConfig>={
 admin:{name:"DMS Admin",title:"Administrator",initials:"SA",home:"/dashboard",nav:adminNav,bottom:[adminNav[0],adminNav[2],adminNav[4],adminNav[5],adminNav[11]]},
 manager:{name:"Manager",title:"Monitoring & overview",initials:"MG",home:"/manager",nav:[
  {href:"/manager",label:"Overview",icon:"home",module:"dashboard"},{href:"/manager/attention",label:"Attention",icon:"target",module:"attention"},
  {href:"/manager/supervisors",label:"Supervisors",icon:"users",module:"employees"},{href:"/manager/rsos",label:"RSOs",icon:"chart",module:"performance"},
  {href:"/manager/bp-activations",label:"BP Activations",icon:"sim",module:"bp"}],bottom:[]},
 supervisor:{name:"Supervisor",title:"Team management",initials:"SP",home:"/supervisor",nav:[
  {href:"/supervisor",label:"Overview",icon:"home",module:"dashboard"},{href:"/supervisor/attention",label:"Attention",icon:"target",module:"attention"},
  {href:"/supervisor/rsos",label:"My RSOs",icon:"users",module:"employees"},{href:"/supervisor/retailers",label:"Retailers",icon:"shop",module:"retailers"},
  {href:"/supervisor/bp-activations",label:"BP Activations",icon:"sim",module:"bp"}],bottom:[]},
 accounts:{name:"Accounts",title:"Data management",initials:"AC",home:"/accounts",nav:[
  {href:"/accounts",label:"Overview",icon:"home",module:"dashboard"},{href:"/accounts/operations",label:"Operations",icon:"upload",module:"ga"},
  {href:"/accounts/retailers",label:"Retailer Search",icon:"search",module:"retailers"},{href:"/accounts/attention",label:"Opportunity",icon:"target",module:"attention"},
  {href:"/accounts/people",label:"RSO & BP",icon:"users",module:"employees"},{href:"/accounts/operations/targets",label:"SC & Targets",icon:"target",module:"targets"}],bottom:[]},
 rso:{name:"RSO",title:"Field sales",initials:"RS",home:"/rso",nav:[
  {href:"/rso",label:"Home",icon:"home",module:"dashboard"},{href:"/rso/attention",label:"Attention",icon:"target",module:"attention"},
  {href:"/rso/retailers",label:"Retailers",icon:"shop",module:"retailers"},{href:"/rso/bp",label:"My BP",icon:"users",module:"bp"},
  {href:"/rso/bp/activations",label:"BP Activations",icon:"sim",module:"bp"}],bottom:[]},
 bp:{name:"BP",title:"SIM sales",initials:"BP",home:"/bp",nav:[
  {href:"/bp",label:"Home",icon:"home",module:"dashboard"},{href:"/bp/sales",label:"Sales",icon:"sim",module:"ga"}],bottom:[]},
 it:{name:"DMS IT",title:"IT Administration",initials:"IT",home:"/dashboard",nav:adminNav,bottom:[adminNav[0],adminNav[2],adminNav[4],adminNav[5],adminNav[11]]},
};
for(const key of ["manager","supervisor","accounts","rso","bp"]) configs[key].bottom=configs[key].nav.slice(0,4);
configs.manager.bottom=configs.manager.nav;
configs.supervisor.bottom=configs.supervisor.nav;
configs.rso.bottom=configs.rso.nav;
configs.accounts.bottom=configs.accounts.nav;
function roleFor(path:string){const first=path.split("/").filter(Boolean)[0]||"";return configs[first]||configs.admin}
function active(path:string,href:string){const homes=new Set(["/dashboard","/manager","/supervisor","/accounts","/rso","/bp"]);if(homes.has(href))return path===href;return path===href||(href!=="/"&&path.startsWith(href+"/"))}
function allowed(item:NavItem,permissions:ClientPermissionMap,admin:boolean){
 if(admin)return true;
 if(item.href==="/accounts/operations")return ["ga","c2c","c2s","ob","targets"].some(m=>permissions[m]?.view);
 return !item.module||Boolean(permissions[item.module]?.view)
}
export default function AppShell({children,user,permissions}:{children:React.ReactNode;user:{displayName:string;role:string}|null;permissions:ClientPermissionMap}){
 const path=usePathname(); if(path==="/login"||path==="/setup"||path==="/sacool") return <PermissionProvider permissions={permissions}>{children}</PermissionProvider>;
 const roleKey=user?.role.toLowerCase()||path.split("/").filter(Boolean)[0]||"admin",role=user?configs[roleKey]||roleFor(path):roleFor(path),profileName=user?.displayName||role.name;
 const roleName=(user?.role||"").toUpperCase();const isAdmin=roleName==="ADMIN"||roleName==="IT"||path==="/dashboard"||path.startsWith("/admin/");
 const visibleNav=role.nav.filter(i=>allowed(i,permissions,isAdmin));
 const visibleBottom=role.bottom.filter(i=>allowed(i,permissions,isAdmin));
 return <PermissionProvider permissions={permissions}><div className={`app-root ${isAdmin?"admin-app":`${roleKey}-app`}`}>
  <aside className="desktop-sidebar"><div className="sidebar-brand"><Brand href={role.home}/></div><div className="sidebar-section">{role.title}</div>{isAdmin?<AdminNav path={path} permissions={permissions}/>:visibleNav.map(i=><NavLink key={i.href} item={i} path={path}/>)}<div className="sidebar-spacer"/><button className="sidebar-link sidebar-button" aria-label="Sign out" onClick={async()=>{await fetch("/api/auth/logout",{method:"POST"});location.href="/login"}}><Icon name="logout"/>Sign out</button><div className="sidebar-profile"><div className="avatar">{role.initials}</div><div><div className="profile-name">{profileName}</div><div className="profile-role">{role.title}</div></div></div></aside>
  <div className="app-main"><header className="mobile-topbar"><div className="mobile-context"><Brand href={role.home}/><span>{currentLabel(path,visibleNav,role.home)}</span></div><Link href={role.home} className="avatar avatar-link" aria-label={`${role.title} home`}>{role.initials}</Link></header>{children}</div>
  {visibleBottom.length>0&&<nav className="bottom-nav role-bottom" style={{gridTemplateColumns:`repeat(${visibleBottom.length},1fr)`}}>{visibleBottom.map(i=><Link key={i.href} href={i.href} className={`bottom-link ${active(path,i.href)?"active":""}`}><Icon name={i.icon}/><span>{i.label}</span></Link>)}</nav>}
 </div></PermissionProvider>
}
function AdminNav({path,permissions}:{path:string;permissions:ClientPermissionMap}){
 const groups=[
  {label:"Overview",icon:"home",items:[adminNav[0]]},
  {label:"Performance",icon:"chart",items:adminNav.slice(1,5)},
  {label:"Data Operations",icon:"upload",items:adminNav.slice(5,11)},
  {label:"Management",icon:"users",items:adminNav.slice(11,16)},
 ];
 return <nav className="admin-sidebar-nav">{groups.map(g=>{
  const items=g.items.filter(i=>allowed(i,permissions,true));if(!items.length)return null;
  const groupActive=items.some(i=>active(path,i.href));
  return <details className={`admin-nav-group ${groupActive?"group-active":""}`} open={groupActive||g.label==="Overview"} key={g.label}>
   <summary><span><Icon name={g.icon}/>{g.label}</span><b>⌄</b></summary>
   <div className="admin-nav-items">{items.map(i=><NavLink key={i.href} item={i} path={path}/>)}</div>
  </details>
 })}</nav>
}
function currentLabel(path:string,nav:NavItem[],home:string){
 if(path===home)return "Overview";
 const exact=[...nav].sort((a,b)=>b.href.length-a.href.length).find(i=>active(path,i.href));
 return exact?.label||"DMS";
}
function Brand({href}:{href:string}){return <Link href={href} className="brand"><div className="brand-mark">D</div><div><div className="brand-title">DMS</div><div className="brand-sub">Distribution Management</div></div></Link>}
function NavLink({item,path}:{item:NavItem;path:string}){return <Link href={item.href} className={`sidebar-link ${active(path,item.href)?"active":""}`}><Icon name={item.icon}/>{item.label}</Link>}
