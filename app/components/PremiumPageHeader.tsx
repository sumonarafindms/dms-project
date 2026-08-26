import {Icon} from "./icons";

export function PremiumPageHeader({
 title,subtitle,kicker,icon="chart",actions,meta
}:{title:string;subtitle?:string;kicker?:string;icon?:string;actions?:React.ReactNode;meta?:React.ReactNode}){
 return <section className="premium-page-head-v77">
  <div className="premium-page-head-copy">
   <span className="premium-page-head-icon"><Icon name={icon}/></span>
   <div>
    {kicker?<div className="premium-page-kicker">{kicker}</div>:null}
    <h1>{title}</h1>
    {subtitle?<p>{subtitle}</p>:null}
    {meta?<div className="premium-page-meta">{meta}</div>:null}
   </div>
  </div>
  {actions?<div className="premium-page-actions">{actions}</div>:null}
 </section>
}
