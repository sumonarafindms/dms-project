"use client";
import {useState} from "react";
import Link from "next/link";
import {Icon} from "./icons";

export type AdminEmployeeRow={
 id:string;name:string;mobile:string;role:string;active:boolean;
 meta:string;detail:string;editHref:string;
};

export function EmployeeHubCard({href,icon,title,count,sub}:{href:string;icon:string;title:string;count:number;sub:string}){
 return <Link href={href} className="card employee-hub-card"><span className="employee-hub-icon"><Icon name={icon}/></span><div><strong>{title}</strong><span>{sub}</span></div><b>{count}</b><em>›</em></Link>
}

export function EmployeeList({title,rows,addHref}:{title:string;rows:AdminEmployeeRow[];addHref:string}){
 const [q,setQ]=useState("");
 const filtered=rows.filter(x=>!q||`${x.name} ${x.mobile} ${x.meta} ${x.detail}`.toLowerCase().includes(q.toLowerCase()));
 const active=rows.filter(x=>x.active).length;
 return <><section className="employee-list-command"><div><span>WORKFORCE DIRECTORY</span><h2>{title}</h2><p>{rows.length} total · {active} active · {rows.length-active} inactive</p></div><Link href={addHref} className="btn admin-primary"><Icon name="users"/>Add New</Link></section><div className="employee-list-toolbar employee-v3-toolbar"><div className="employee-search"><Icon name="search"/><div><label>SEARCH {title.toUpperCase()}</label><input value={q} onChange={e=>setQ(e.target.value)} placeholder={`Name, mobile, code or assignment`}/></div></div><span>{filtered.length} results</span></div>
 <div className="employee-list-card employee-v3-list">{filtered.map(x=><Link href={x.editHref} className="employee-list-row employee-v3-row" key={x.id}><div className="employee-avatar">{x.name.slice(0,2).toUpperCase()}</div><div className="employee-main"><strong>{x.name}</strong><span>{x.meta}</span><small>{x.detail}</small></div><div className="employee-state"><b className={x.active?"active":"inactive"}>{x.active?"Active":"Inactive"}</b><span>{x.mobile||"No login"}</span></div><em>›</em></Link>)}{!filtered.length&&<div className="admin-empty"><Icon name="users"/><strong>No matching records</strong><span>Try a different search.</span></div>}</div></>
}

export function SaveNotice({message,ok}:{message:string;ok:boolean}){return message?<div className={`employee-notice ${ok?"ok":"bad"}`}>{message}</div>:null}
