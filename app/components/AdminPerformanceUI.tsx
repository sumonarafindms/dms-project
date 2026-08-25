import Link from "next/link";
import {Icon} from "./icons";

export function PerfHead({title,subtitle,month,q,placeholder="Search"}:{title:string;subtitle:string;month:string;q:string;placeholder?:string}){
 return <><div className="perf-head"><div><div className="admin-kicker">PERFORMANCE</div><h1>{title}</h1><p>{subtitle}</p></div></div><form className="perf-filter"><div className="perf-search"><Icon name="search"/><input name="q" defaultValue={q} placeholder={placeholder}/></div><input type="month" name="month" defaultValue={month}/><button className="btn admin-primary">Apply</button></form></>
}
export function PerfSummary({items}:{items:{label:string;value:string|number;sub:string}[]}){
 return <div className="perf-summary">{items.map(x=><div className="card perf-summary-card" key={x.label}><span>{x.label}</span><strong>{x.value}</strong><small>{x.sub}</small></div>)}</div>
}
export function PerfBar({achieved,target}:{achieved:number;target:number}){
 const p=target?Math.round(achieved/target*100):0;return <div className="perf-bar-wrap"><div className="perf-bar"><span style={{width:`${Math.min(100,p)}%`}}/></div><b>{p}%</b></div>
}
export function EmptyPerf({text}:{text:string}){return <div className="card admin-empty"><Icon name="chart"/><strong>{text}</strong><span>Try another month or search term.</span></div>}
export function Breadcrumb({items}:{items:{label:string;href?:string}[]}){return <div className="perf-breadcrumb">{items.map((x,i)=><span key={x.label}>{i>0&&<b>›</b>}{x.href?<Link href={x.href}>{x.label}</Link>:x.label}</span>)}</div>}
