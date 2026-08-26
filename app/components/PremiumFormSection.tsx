import {ReactNode} from "react";
import {Icon} from "./icons";

export function PremiumFormSection({title,subtitle,icon="edit",children,aside}:{title:string;subtitle?:string;icon?:string;children:ReactNode;aside?:ReactNode}){
 return <section className="premium-form-section-v66">
  <div className="premium-form-section-head">
   <span className="premium-form-section-icon"><Icon name={icon}/></span>
   <div><h2>{title}</h2>{subtitle?<p>{subtitle}</p>:null}</div>
   {aside?<div className="premium-form-section-aside">{aside}</div>:null}
  </div>
  <div className="premium-form-section-body">{children}</div>
 </section>
}
