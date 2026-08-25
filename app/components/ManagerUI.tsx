import Link from "next/link";
import {Icon} from "./icons";
import {pct} from "../../lib/performance";

export function ManagerHero({name,month,supervisors,rsos,retailers,attention,expected}:{name:string;month:string;supervisors:number;rsos:number;retailers:number;attention:number;expected:number}){
 return <section className="manager-v5-hero">
  <div className="manager-v5-copy"><div className="manager-v5-kicker">TEAM MONITORING</div><h1>Good day, {name}</h1><p>Track assigned teams, execution pace and field opportunities without system-wide Admin noise.</p><div className="manager-v5-tags"><span>{month.slice(0,7)}</span><span>{expected}% month elapsed</span><span>{supervisors} assigned teams</span></div></div>
  <div className="manager-v5-command">
   <div><span>NEEDS ATTENTION</span><strong>{attention}</strong><small>Retailers with current execution gaps</small></div>
   <Link href="/manager/attention">Review priorities <b>›</b></Link>
  </div>
  <div className="manager-v5-network"><div><span>SUPERVISORS</span><strong>{supervisors}</strong></div><div><span>RSOs</span><strong>{rsos}</strong></div><div><span>RETAILERS</span><strong>{retailers.toLocaleString()}</strong></div></div>
 </section>
}
export function ManagerMetric({label,value,target,icon,unit=""}:{label:string;value:number;target:number;icon:string;unit?:string}){
 const progress=pct(value,target),remaining=Math.max(0,target-value);
 return <article className="manager-v5-metric"><div className="manager-v5-metric-top"><span><Icon name={icon}/></span><b className={progress>=80?"good":progress>=50?"mid":"low"}>{progress}%</b></div><small>{label}</small><strong>{unit}{Math.round(value).toLocaleString()}</strong><div className="manager-v5-progress"><i style={{width:`${Math.min(100,progress)}%`}}/></div><div className="manager-v5-metric-foot"><span>Target {unit}{Math.round(target).toLocaleString()}</span><span>{unit}{Math.round(remaining).toLocaleString()} left</span></div></article>
}
export function ManagerSectionHead({eyebrow,title,sub,href,label}:{eyebrow:string;title:string;sub?:string;href?:string;label?:string}){
 return <div className="manager-v5-section-head"><div><span>{eyebrow}</span><h2>{title}</h2>{sub&&<p>{sub}</p>}</div>{href&&<Link href={href}>{label||"View all"} <b>›</b></Link>}</div>
}
export function ManagerSupervisorCards({items,expected}:{items:Array<{id?:string;name:string;rsos:number;retailers:number;achieved:number;target:number}>;expected:number}){
 return <div className="manager-v5-team-grid">{items.map((x,i)=>{const p=pct(x.achieved,x.target),status=p>=expected+8?"Ahead":p>=expected-5?"On track":"Behind";return <Link href={x.id?`/manager/supervisors/${x.id}`:"/manager/supervisors"} className="manager-v5-team-card" key={x.name}><div className="manager-v5-team-top"><span className={`team-color-${i%4+1}`}>{x.name.slice(0,2).toUpperCase()}</span><div><strong>{x.name}</strong><small>{x.rsos} RSOs · {x.retailers.toLocaleString()} retailers</small></div><b>{p}%</b></div><div className="manager-v5-progress"><i style={{width:`${Math.min(100,p)}%`}}/></div><div className="manager-v5-team-foot"><span>{status}</span><small>Recharge execution</small></div></Link>})}</div>
}
export function ManagerListCard({href,name,meta,progress,secondary,status}:{href:string;name:string;meta:string;progress:number;secondary?:string;status?:string}){
 return <Link href={href} className="manager-v5-list-card"><div className="manager-v5-list-avatar">{name.slice(0,2).toUpperCase()}</div><div className="manager-v5-list-main"><strong>{name}</strong><span>{meta}</span>{secondary&&<small>{secondary}</small>}</div><div className="manager-v5-list-side"><b>{progress}%</b>{status&&<span className={status.toLowerCase().replace(" ","-")}>{status}</span>}<i>›</i></div></Link>
}
