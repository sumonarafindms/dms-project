import Link from "next/link";
import {Icon} from "./icons";
import {LiveFilterForm} from "./LiveFilterForm";

export function PerfHead({title,subtitle,month,q,placeholder="Search",from,to}:{title:string;subtitle:string;month:string;q:string;placeholder?:string;from?:string;to?:string}){
 const start=from||`${month}-01`,end=to||new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),0).toISOString().slice(0,10);
 return <><section className="perf-v2-head"><div><div className="admin-kicker">PERFORMANCE INTELLIGENCE</div><h1>{title}</h1><p>{subtitle}</p></div><div className="perf-v2-period"><span>REPORTING PERIOD</span><strong>{start}</strong><i>→</i><strong>{end}</strong></div></section><LiveFilterForm className="perf-filter date-perf-filter perf-v2-filter live-filter-v63"><div className="perf-search"><span><Icon name="search"/></span><div><label>SEARCH</label><input name="q" defaultValue={q} placeholder={placeholder} autoComplete="off"/></div></div><label><span>FROM</span><input type="date" name="from" defaultValue={start}/></label><label><span>TO</span><input type="date" name="to" defaultValue={end}/></label><span className="live-filter-status"><Icon name="filter"/>Live filter</span></LiveFilterForm></>
}
export function PerfSummary({items}:{items:{label:string;value:string|number;sub:string}[]}){
 return <div className="perf-summary perf-v2-summary">{items.map((x,i)=><div className={`perf-summary-card perf-v2-summary-card tone-${(i%4)+1}`} key={x.label}><span>{x.label}</span><strong>{x.value}</strong><small>{x.sub}</small><i/></div>)}</div>
}
export function PerfBar({achieved,target}:{achieved:number;target:number}){
 const p=target?Math.round(achieved/target*100):0;return <div className="perf-bar-wrap"><div className="perf-bar"><span style={{width:`${Math.min(100,p)}%`}}/></div><b>{p}%</b></div>
}
export function EmptyPerf({text}:{text:string}){return <div className="card admin-empty"><Icon name="chart"/><strong>{text}</strong><span>Try another month or search term.</span></div>}
export function Breadcrumb({items}:{items:{label:string;href?:string}[]}){return <div className="perf-breadcrumb">{items.map((x,i)=><span key={x.label}>{i>0&&<b>›</b>}{x.href?<Link href={x.href}>{x.label}</Link>:x.label}</span>)}</div>}
