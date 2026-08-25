import Link from "next/link";
import {Icon} from "./icons";
import {dhakaMonth} from "../../lib/business-time";

export function FilterForm({q="",month,from,to,placeholder="Search",showMonth=true,dateRange=false}:{q?:string;month?:string;from?:string;to?:string;placeholder?:string;showMonth?:boolean;dateRange?:boolean}){
 const m=(from?.slice(0,7)||month||dhakaMonth()).slice(0,7);
 const start=from||`${m}-01`,end=to||new Date(Number(m.slice(0,4)),Number(m.slice(5,7)),0).toISOString().slice(0,10);
 return <form className="filter-bar premium-filter-bar" method="get">
  <div className="premium-filter-search"><span><Icon name="search"/></span><div><label>SEARCH</label><input name="q" defaultValue={q} placeholder={placeholder}/></div></div>
  {showMonth&&(dateRange?
   <div className="premium-date-group"><label><span>FROM</span><input type="date" name="from" defaultValue={start}/></label><i>→</i><label><span>TO</span><input type="date" name="to" defaultValue={end}/></label></div>:
   <label className="premium-month-filter"><span>MONTH</span><input type="month" name="month" defaultValue={m}/></label>
  )}
  <button className="btn admin-primary premium-filter-submit" type="submit"><Icon name="search"/>Apply</button>
 </form>
}
export function LinkedList({title,items,empty="No results found."}:{title:string;items:Array<{href:string;name:string;meta:string;right?:string;status?:string}>;empty?:string}){
 return <section className="section"><div className="section-head"><h2 className="section-title">{title}</h2><span className="section-link">{items.length} items</span></div><div className="card panel linked-list">{items.length?items.map((i,idx)=><Link className="team-row linked-row" href={i.href} key={i.href+idx}><div className="team-person"><div className="person-avatar">{i.name.slice(0,2).toUpperCase()}</div><div><div className="person-name">{i.name}</div><div className="person-meta">{i.meta}</div></div></div><div className="linked-right"><div className="mini-value">{i.right||"View"}</div>{i.status&&<div className="mini-label">{i.status}</div>}<span className="chevron">›</span></div></Link>):<div className="empty shared-empty-v9"><span>○</span><strong>{empty}</strong></div>}</div></section>
}
export function StatStrip({items}:{items:Array<{label:string;value:string|number;good?:boolean}>}){return <div className="detail-stat-grid">{items.map(i=><div className="card detail-stat" key={i.label}><div className="metric-label">{i.label}</div><div className="detail-stat-value">{i.value}</div>{typeof i.good==="boolean"&&<span className={`status-pill ${i.good?"status-good":"status-low"}`}>{i.good?"Complete":"Pending"}</span>}</div>)}</div>}
