import {Icon} from "./icons";

export function PremiumEmpty({title,subtitle,icon="info",action}:{title:string;subtitle?:string;icon?:string;action?:React.ReactNode}){
 return <div className="premium-state-v72 empty">
  <span className="premium-state-icon"><Icon name={icon}/></span>
  <div><strong>{title}</strong>{subtitle?<p>{subtitle}</p>:null}{action?<div className="premium-state-action">{action}</div>:null}</div>
 </div>
}
export function PremiumLoading({label="Loading data..."}:{label?:string}){
 return <div className="premium-state-v72 loading" role="status">
  <span className="premium-spinner-v72"/><div><strong>{label}</strong><p>Please wait while DMS updates this view.</p></div>
 </div>
}
export function PremiumDangerNote({title="Important",children}:{title?:string;children:React.ReactNode}){
 return <div className="premium-state-v72 danger"><span className="premium-state-icon"><Icon name="alert"/></span><div><strong>{title}</strong><p>{children}</p></div></div>
}
