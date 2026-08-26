import {Icon} from "./icons";

export function PremiumDetailStat({label,value,note,icon="chart",tone="indigo"}:{label:string;value:string|number;note?:string;icon?:string;tone?:string}){
 return <article className={`premium-detail-stat-v68 tone-${tone}`}>
  <span className="premium-detail-stat-icon"><Icon name={icon}/></span>
  <div><span>{label}</span><strong>{value}</strong>{note?<small>{note}</small>:null}</div>
 </article>
}
