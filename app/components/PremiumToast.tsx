"use client";
import {Icon} from "./icons";

export function PremiumToast({
 message,tone="info",onClose
}:{message?:string;tone?:"success"|"error"|"warning"|"info";onClose?:()=>void}){
 if(!message)return null;
 const icon=tone==="success"?"check":tone==="error"||tone==="warning"?"alert":"info";
 return <div className={`premium-toast-v78 tone-${tone}`} role={tone==="error"?"alert":"status"}>
  <span className="premium-toast-icon-v78"><Icon name={icon}/></span>
  <div><strong>{tone==="success"?"Success":tone==="error"?"Error":tone==="warning"?"Attention":"Status"}</strong><span>{message}</span></div>
  {onClose?<button type="button" aria-label="Close notification" onClick={onClose}>×</button>:null}
 </div>
}
