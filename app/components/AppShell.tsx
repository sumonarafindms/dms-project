"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {Icon} from "./icons";

type NavItem={href:string;label:string;icon:string};
type RoleConfig={name:string;title:string;initials:string;home:string;nav:NavItem[];bottom:NavItem[]};
const adminNav:NavItem[]=[
 {href:"/dashboard",label:"Dashboard",icon:"home"},{href:"/admin/performance",label:"Performance",icon:"chart"},{href:"/admin/attention",label:"Attention",icon:"target"},{href:"/admin/retailers",label:"Retailer Search",icon:"search"},{href:"/master-data",label:"Master Data",icon:"users"},{href:"/targets",label:"Targets",icon:"target"},{href:"/ga",label:"GA & SSO",icon:"sim"},{href:"/c2c",label:"C2C",icon:"wallet"},{href:"/c2s",label:"C2S & LSO",icon:"chart"},{href:"/ob",label:"Opening Balance",icon:"balance"},{href:"/admin/bp-management",label:"BP Management",icon:"shop"},{href:"/admin/users",label:"Users & Access",icon:"users"},{href:"/ui-preview",label:"Role Preview",icon:"eye"},
];
const configs:Record<string,RoleConfig>={
 admin:{name:"DMS Admin",title:"Administrator",initials:"SA",home:"/dashboard",nav:adminNav,bottom:[adminNav[0],adminNav[2],adminNav[3],adminNav[6],adminNav[7]]},
 manager:{name:"Manager",title:"Monitoring & overview",initials:"MG",home:"/manager",nav:[{href:"/manager",label:"Overview",icon:"home"},{href:"/manager/attention",label:"Attention",icon:"target"},{href:"/manager/supervisors",label:"Supervisors",icon:"users"},{href:"/manager/rsos",label:"RSOs",icon:"chart"},{href:"/manager/bp-activations",label:"BP Activations",icon:"sim"}],bottom:[]},
 supervisor:{name:"Supervisor",title:"Team management",initials:"SP",home:"/supervisor",nav:[{href:"/supervisor",label:"Overview",icon:"home"},{href:"/supervisor/attention",label:"Attention",icon:"target"},{href:"/supervisor/rsos",label:"My RSOs",icon:"users"},{href:"/supervisor/retailers",label:"Retailers",icon:"shop"},{href:"/supervisor/bp-activations",label:"BP Activations",icon:"sim"}],bottom:[]},
 accounts:{name:"Accounts",title:"Data management",initials:"AC",home:"/accounts",nav:[{href:"/accounts",label:"Overview",icon:"home"},{href:"/accounts/operations",label:"Operations",icon:"upload"},{href:"/accounts/retailers",label:"Retailer Search",icon:"search"},{href:"/accounts/attention",label:"Opportunity",icon:"target"},{href:"/accounts/people",label:"RSO & BP",icon:"users"},{href:"/accounts/operations/targets",label:"SC & Targets",icon:"target"}],bottom:[]},
 rso:{name:"RSO",title:"Field sales",initials:"RS",home:"/rso",nav:[{href:"/rso",label:"Home",icon:"home"},{href:"/rso/attention",label:"Attention",icon:"target"},{href:"/rso/retailers",label:"Retailers",icon:"shop"},{href:"/rso/bp",label:"My BP",icon:"users"},{href:"/rso/bp/activations",label:"BP Activations",icon:"sim"}],bottom:[]},
 bp:{name:"BP",title:"SIM sales",initials:"BP",home:"/bp",nav:[{href:"/bp",label:"Home",icon:"home"},{href:"/bp/sales",label:"Sales",icon:"sim"}],bottom:[]},
};
for(const key of ["manager","supervisor","accounts","rso","bp"]) configs[key].bottom=configs[key].nav.slice(0,4);
function roleFor(path:string){const first=path.split("/").filter(Boolean)[0]||"";return configs[first]||configs.admin}
function active(path:string,href:string){return path===href||(href!=="/"&&path.startsWith(href+"/"))}
export default function AppShell({children,user}:{children:React.ReactNode;user:{displayName:string;role:string}|null}){
 const path=usePathname(); if(path==="/login"||path==="/setup") return <>{children}</>;
 const role=user?configs[user.role.toLowerCase()]||roleFor(path):roleFor(path);
 const profileName=user?.displayName||role.name;
 return <div className="app-root">
  <aside className="desktop-sidebar"><div className="sidebar-brand"><Brand href={role.home}/></div><div className="sidebar-section">{role.title}</div>{role.nav.map(i=><NavLink key={i.href} item={i} path={path}/>)}<div className="sidebar-spacer"/><button className="sidebar-link sidebar-button" onClick={async()=>{await fetch("/api/auth/logout",{method:"POST"});location.href="/login"}}><Icon name="logout"/>Sign out</button><div className="sidebar-profile"><div className="avatar">{role.initials}</div><div><div className="profile-name">{profileName}</div><div className="profile-role">{role.title}</div></div></div></aside>
  <div className="app-main"><header className="mobile-topbar"><Brand href={role.home}/><Link href={role.home} className="avatar avatar-link">{role.initials}</Link></header>{children}</div>
  <nav className="bottom-nav role-bottom" style={{gridTemplateColumns:`repeat(${role.bottom.length},1fr)`}}>{role.bottom.map(i=><Link key={i.href} href={i.href} className={`bottom-link ${active(path,i.href)?"active":""}`}><Icon name={i.icon}/><span>{i.label}</span></Link>)}</nav>
 </div>
}
function Brand({href}:{href:string}){return <Link href={href} className="brand"><div className="brand-mark">D</div><div><div className="brand-title">DMS</div><div className="brand-sub">Distribution Management</div></div></Link>}
function NavLink({item,path}:{item:NavItem;path:string}){return <Link href={item.href} className={`sidebar-link ${active(path,item.href)?"active":""}`}><Icon name={item.icon}/>{item.label}</Link>}
