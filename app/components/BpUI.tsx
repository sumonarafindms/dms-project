import Link from "next/link";
import {Icon} from "./icons";

export function BpHero({name,code,retailer,today,monthly,target}:{name:string;code:string;retailer:string;today:number;monthly:number;target:number}){
 const remaining=Math.max(0,target-monthly),p=target?Math.min(100,Math.round(monthly/target*100)):0;
 return <section className="bp-v8-hero">
  <div className="bp-v8-top"><div><div className="bp-v8-kicker">SIM SALES DASHBOARD</div><h1>Hello, {name}</h1><p>{code} · {retailer}</p></div><span>BP</span></div>
  <div className="bp-v8-main"><div><small>GA COMPLETED</small><strong>{monthly}<i>{target?` / ${target}`:""}</i></strong><p>{target?`${remaining} activations remaining`:"Monthly target not set"}</p></div><div className="bp-v8-ring"><b>{target?`${p}%`:"LIVE"}</b><small>MONTH</small></div></div>
  <div className="bp-v8-progress"><i style={{width:`${p}%`}}/></div>
  <div className="bp-v8-today"><span><Icon name="sim"/></span><div><small>TODAY'S GA</small><strong>{today}</strong></div><b>{today?"Keep selling":"Start today's sales"}</b></div>
 </section>
}
export function BpInfo({label,value,sub,icon}:{label:string;value:string|number;sub:string;icon:string}){
 return <article className="bp-v8-info"><span><Icon name={icon}/></span><div><small>{label}</small><strong>{value}</strong><p>{sub}</p></div></article>
}
export function BpAction({href,title,sub}:{href:string;title:string;sub:string}){
 return <Link href={href} className="bp-v8-action"><span><Icon name="sim"/></span><div><strong>{title}</strong><small>{sub}</small></div><b>›</b></Link>
}
