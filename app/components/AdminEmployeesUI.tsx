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
 return <><div className="employee-list-toolbar"><div className="employee-search"><Icon name="search"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder={`Search ${title.toLowerCase()}`}/></div><Link href={addHref} className="btn admin-primary">Add New</Link></div>
 <div className="card employee-list-card">{filtered.map(x=><Link href={x.editHref} className="employee-list-row" key={x.id}><div className="employee-avatar">{x.name.slice(0,2).toUpperCase()}</div><div className="employee-main"><strong>{x.name}</strong><span>{x.meta}</span><small>{x.detail}</small></div><div className="employee-state"><b className={x.active?"active":"inactive"}>{x.active?"Active":"Inactive"}</b><span>{x.mobile||"No login"}</span></div><em>›</em></Link>)}{!filtered.length&&<div className="admin-empty"><Icon name="users"/><strong>No matching records</strong></div>}</div></>
}

export function SaveNotice({message,ok}:{message:string;ok:boolean}){return message?<div className={`employee-notice ${ok?"ok":"bad"}`}>{message}</div>:null}
