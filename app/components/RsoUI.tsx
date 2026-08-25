import Link from "next/link";
import type {CSSProperties} from "react";
import {Icon} from "./icons";
import {pct} from "../../lib/performance";

export function RsoHero({name,month,retailers,attention,ga,gaTarget,expected}:{name:string;month:string;retailers:number;attention:number;ga:number;gaTarget:number;expected:number}){
 const progress=pct(ga,gaTarget);
 return <section className="rso-v7-hero">
  <div className="rso-v7-hero-top"><div><div className="rso-v7-kicker">MY SALES DAY</div><h1>Hello, {name}</h1><p>Check your progress, follow retailer gaps and reach the most important field actions quickly.</p></div><span>{month.slice(0,7)}</span></div>
  <div className="rso-v7-ga"><div><small>MONTHLY GA</small><strong>{ga}<i> / {gaTarget}</i></strong><p>{Math.max(0,gaTarget-ga)} remaining</p></div><div className="rso-v7-ring" style={{"--rso-p":`${Math.min(100,progress)*3.6}deg`} as CSSProperties}><span>{progress}%</span></div></div>
  <div className="rso-v7-hero-progress"><i style={{width:`${Math.min(100,progress)}%`}}/></div>
  <div className="rso-v7-network"><div><small>RETAILERS</small><strong>{retailers}</strong></div><div className={attention?"alert":""}><small>NEED FOCUS</small><strong>{attention}</strong></div><div><small>MONTH PACE</small><strong>{expected}%</strong></div></div>
 </section>
}
export function RsoKpi({label,value,target,icon,unit=""}:{label:string;value:number;target:number;icon:string;unit?:string}){
 const p=pct(value,target);return <article className="rso-v7-kpi"><div><span><Icon name={icon}/></span><b className={p>=80?"good":p>=50?"mid":"low"}>{p}%</b></div><small>{label}</small><strong>{unit}{Math.round(value).toLocaleString()}</strong><div className="rso-v7-progress"><i style={{width:`${Math.min(100,p)}%`}}/></div><footer><span>Target {unit}{Math.round(target).toLocaleString()}</span><span>{unit}{Math.max(0,Math.round(target-value)).toLocaleString()} left</span></footer></article>
}
export function RsoAction({href,icon,title,sub,accent}:{href:string;icon:string;title:string;sub:string;accent?:boolean}){
 return <Link href={href} className={`rso-v7-action ${accent?"accent":""}`}><span><Icon name={icon}/></span><div><strong>{title}</strong><small>{sub}</small></div><b>›</b></Link>
}
export function RsoSection({eyebrow,title,sub,href,label}:{eyebrow:string;title:string;sub?:string;href?:string;label?:string}){
 return <div className="rso-v7-section-head"><div><span>{eyebrow}</span><h2>{title}</h2>{sub&&<p>{sub}</p>}</div>{href&&<Link href={href}>{label||"View all"} <b>›</b></Link>}</div>
}
