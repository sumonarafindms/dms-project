import Link from "next/link";
import {Icon} from "./icons";
import {pct} from "../../lib/performance";

export function SupervisorHero({name,month,rsos,retailers,attention,expected}:{name:string;month:string;rsos:number;retailers:number;attention:number;expected:number}){
 return <section className="supervisor-v6-hero">
  <div><div className="supervisor-v6-kicker">MY FIELD TEAM</div><h1>Hello, {name}</h1><p>See who needs follow-up, how your RSOs are progressing and where retailer execution is falling behind.</p><div className="supervisor-v6-tags"><span>{month.slice(0,7)}</span><span>{expected}% month elapsed</span><span>{rsos} active RSOs</span></div></div>
  <Link href="/supervisor/attention" className={`supervisor-v6-alert ${attention?"active":"clear"}`}><span>{attention?"!":"✓"}</span><div><small>NEEDS ATTENTION</small><strong>{attention?`${attention} retailers`:"Team clear"}</strong><p>{attention?"Open field follow-up queue":"No current execution gaps"}</p></div><b>›</b></Link>
  <div className="supervisor-v6-network"><div><small>MY RSOs</small><strong>{rsos}</strong></div><div><small>RETAILERS</small><strong>{retailers.toLocaleString()}</strong></div><div><small>TEAM PACE</small><strong>{expected}%</strong></div></div>
 </section>
}
export function SupervisorKpi({label,value,target,icon,unit=""}:{label:string;value:number;target:number;icon:string;unit?:string}){
 const p=pct(value,target);return <article className="supervisor-v6-kpi"><div><span><Icon name={icon}/></span><b className={p>=80?"good":p>=50?"mid":"low"}>{p}%</b></div><small>{label}</small><strong>{unit}{Math.round(value).toLocaleString()}</strong><div className="supervisor-v6-progress"><i style={{width:`${Math.min(100,p)}%`}}/></div><footer><span>Target {unit}{Math.round(target).toLocaleString()}</span><span>{unit}{Math.max(0,Math.round(target-value)).toLocaleString()} left</span></footer></article>
}
export function SupervisorSection({eyebrow,title,sub,href,label}:{eyebrow:string;title:string;sub?:string;href?:string;label?:string}){
 return <div className="supervisor-v6-section-head"><div><span>{eyebrow}</span><h2>{title}</h2>{sub&&<p>{sub}</p>}</div>{href&&<Link href={href}>{label||"View all"} <b>›</b></Link>}</div>
}
export function SupervisorRsoCard({href,name,meta,ga,lso,recharge,status}:{href:string;name:string;meta:string;ga:string;lso:string;recharge:number;status:string}){
 return <Link href={href} className="supervisor-v6-rso-card"><div className="supervisor-v6-avatar">{name.slice(0,2).toUpperCase()}</div><div className="supervisor-v6-rso-main"><strong>{name}</strong><span>{meta}</span><div><small>GA <b>{ga}</b></small><small>LSO <b>{lso}</b></small></div></div><aside><strong>{recharge}%</strong><span className={status.toLowerCase().replace(" ","-")}>{status}</span><i>›</i></aside></Link>
}
export function SupervisorQuick({href,icon,title,sub}:{href:string;icon:string;title:string;sub:string}){
 return <Link href={href} className="supervisor-v6-quick"><span><Icon name={icon}/></span><div><strong>{title}</strong><small>{sub}</small></div><b>›</b></Link>
}
