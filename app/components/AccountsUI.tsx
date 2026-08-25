import Link from "next/link";
import {Icon} from "./icons";

export function AccountsHero({name,latestGa,latestC2c,retailers,rsos}:{name:string;latestGa:string;latestC2c:string;retailers:number;rsos:number}){
 return <section className="accounts-v12-hero"><div><div className="accounts-v12-kicker">DATA OPERATIONS</div><h1>Hello, {name}</h1><p>Keep daily field data clean, current and ready for every downstream dashboard.</p><div className="accounts-v12-tags"><span>{rsos} active RSOs</span><span>{retailers.toLocaleString()} retailers</span><span>Live database</span></div></div><div className="accounts-v12-fresh"><span>DATA FRESHNESS</span><strong>{latestGa}</strong><small>Latest GA business date</small><i>Latest C2C: {latestC2c}</i></div></section>
}
export function AccountsSection({eyebrow,title,sub,href}:{eyebrow:string;title:string;sub?:string;href?:string}){
 return <div className="accounts-v12-section-head"><div><span>{eyebrow}</span><h2>{title}</h2>{sub&&<p>{sub}</p>}</div>{href&&<Link href={href}>Open <b>›</b></Link>}</div>
}
export function AccountsAction({href,icon,title,sub,tone}:{href:string;icon:string;title:string;sub:string;tone:string}){
 return <Link href={href} className={`accounts-v12-action tone-${tone}`}><span><Icon name={icon}/></span><div><strong>{title}</strong><small>{sub}</small></div><b>›</b></Link>
}
export function AccountsStat({label,value,sub,tone}:{label:string;value:string|number;sub:string;tone:string}){
 return <article className={`accounts-v12-stat tone-${tone}`}><span>{label}</span><strong>{value}</strong><small>{sub}</small><i/></article>
}
