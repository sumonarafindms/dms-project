import {Icon} from "./icons";

export function PremiumFeedback({message,tone="info"}:{message?:string;tone?:"success"|"error"|"warning"|"info"}){
 if(!message)return null;
 const icon=tone==="success"?"check":tone==="error"?"alert":tone==="warning"?"alert":"info";
 return <div className={`premium-feedback-v66 tone-${tone}`} role={tone==="error"?"alert":"status"}>
  <span className="premium-feedback-icon"><Icon name={icon}/></span>
  <div><strong>{tone==="success"?"Success":tone==="error"?"Action needed":tone==="warning"?"Review":"Status"}</strong><span>{message}</span></div>
 </div>
}
