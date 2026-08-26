"use client";
import {ReactNode} from "react";
import {Icon} from "./icons";

export function PremiumDialog({
 open,title,description,tone="default",confirmLabel="Confirm",cancelLabel="Cancel",
 busy=false,onConfirm,onClose,children
}:{
 open:boolean;title:string;description?:string;tone?:"default"|"danger"|"warning";
 confirmLabel?:string;cancelLabel?:string;busy?:boolean;
 onConfirm:()=>void;onClose:()=>void;children?:ReactNode
}){
 if(!open)return null;
 return <div className="premium-dialog-backdrop-v78" role="presentation" onMouseDown={e=>{if(e.currentTarget===e.target&&!busy)onClose()}}>
  <section className={`premium-dialog-v78 tone-${tone}`} role="dialog" aria-modal="true" aria-labelledby="premium-dialog-title">
   <div className="premium-dialog-head-v78">
    <span className="premium-dialog-icon-v78"><Icon name={tone==="danger"||tone==="warning"?"alert":"info"}/></span>
    <div><h2 id="premium-dialog-title">{title}</h2>{description?<p>{description}</p>:null}</div>
   </div>
   {children?<div className="premium-dialog-body-v78">{children}</div>:null}
   <div className="premium-dialog-actions-v78">
    <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>{cancelLabel}</button>
    <button type="button" className={tone==="danger"?"btn btn-danger":"btn admin-primary"} disabled={busy} aria-busy={busy} onClick={onConfirm}>{busy?"Working...":confirmLabel}</button>
   </div>
  </section>
 </div>
}
