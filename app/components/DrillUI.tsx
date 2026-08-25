import Link from "next/link";
import {Icon} from "./icons";

export function FilterForm({q="",month,placeholder="Search",showMonth=true}:{q?:string;month?:string;placeholder?:string;showMonth?:boolean}){
 return <form className="filter-bar" method="get"><div className="search-box filter-search"><Icon name="search"/><input name="q" defaultValue={q} placeholder={placeholder}/></div>{showMonth&&<input className="control filter-month" type="month" name="month" defaultValue={month}/>}<button className="btn btn-soft filter-submit" type="submit">Filter</button></form>
}
export function LinkedList({title,items,empty="No results found."}:{title:string;items:Array<{href:string;name:string;meta:string;right?:string;status?:string}>;empty?:string}){
 return <section className="section"><div className="section-head"><h2 className="section-title">{title}</h2><span className="section-link">{items.length} items</span></div><div className="card panel linked-list">{items.length?items.map((i,idx)=><Link className="team-row linked-row" href={i.href} key={i.href+idx}><div className="team-person"><div className="person-avatar">{i.name.slice(0,2).toUpperCase()}</div><div><div className="person-name">{i.name}</div><div className="person-meta">{i.meta}</div></div></div><div className="linked-right"><div className="mini-value">{i.right||"View"}</div>{i.status&&<div className="mini-label">{i.status}</div>}<span className="chevron">›</span></div></Link>):<div className="empty">{empty}</div>}</div></section>
}
export function StatStrip({items}:{items:Array<{label:string;value:string|number;good?:boolean}>}){return <div className="detail-stat-grid">{items.map(i=><div className="card detail-stat" key={i.label}><div className="metric-label">{i.label}</div><div className="detail-stat-value">{i.value}</div>{typeof i.good==="boolean"&&<span className={`status-pill ${i.good?"status-good":"status-low"}`}>{i.good?"Complete":"Pending"}</span>}</div>)}</div>}
