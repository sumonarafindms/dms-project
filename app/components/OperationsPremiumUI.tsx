"use client";
import type {ReactNode} from "react";
import {usePathname} from "next/navigation";
import {TableScrollHint} from "./TableScrollHint";
import {PremiumBadge} from "./PremiumBadge";
import {PremiumFeedback} from "./PremiumFeedback";
import {PremiumEmpty} from "./PremiumState";

export function OpsHeader({title,subtitle,from,to,onFrom,onTo,badge}:{title:string;subtitle:string;from?:string;to?:string;onFrom?:(v:string)=>void;onTo?:(v:string)=>void;badge:string}){
 const path=usePathname(),accounts=path.startsWith("/accounts/");const back=accounts?"/accounts/operations":"/admin/upload";
 // A native date input reports "" both while a date is being typed by hand and
 // for any value a min/max attribute rejects. Passing that "" through wiped the
 // range and made the picker look dead, so empty values are ignored here and the
 // TO field has no min: choosing an earlier day pulls FROM back instead of being
 // silently refused.
 const pickFrom=(v:string)=>{if(!v||!onFrom)return;onFrom(v);if(to&&to<v&&onTo)onTo(v)};
 const pickTo=(v:string)=>{if(!v||!onTo)return;onTo(v);if(from&&v<from&&onFrom)onFrom(v)};
 return <header className={`ops-page-head ops-v3-head ${accounts?"accounts-ops-v12-head":""}`}><div className="ops-head-copy"><a href={back} className="ops-back">← {accounts?"Operations":"Upload Center"}</a><div className="ops-title-row"><h1>{title}</h1><span>{badge}</span></div><p>{subtitle}</p><div className="ops-head-chips"><PremiumBadge icon="check" tone="green">Validated import</PremiumBadge><PremiumBadge icon="file">20 MB max</PremiumBadge><PremiumBadge icon="shield">Database protected</PremiumBadge></div></div>{from&&to&&onFrom&&onTo?<div className="ops-date-card"><div className="ops-date-label">REPORTING RANGE</div><label><span>FROM</span><input type="date" value={from} onChange={e=>pickFrom(e.target.value)}/></label><label><span>TO</span><input type="date" value={to} onChange={e=>pickTo(e.target.value)}/></label></div>:null}</header>
}
export function OpsUpload({title,subtitle,sample,children,rule,message}:{title:string;subtitle:string;sample:string;children:ReactNode;rule:ReactNode;message?:string}){
 return <section className="ops-upload-card ops-v3-upload"><div className="ops-card-head"><div className="ops-title"><span className="ops-section-icon">⇧</span><div><span className="ops-overline">IMPORT WORKSPACE</span><h2>{title}</h2><p>{subtitle}</p></div></div><a href={sample} className="ops-sample-btn">⇩ Sample File</a></div><div className="ops-upload-trust"><span><b>1</b> Choose file</span><i>→</i><span><b>2</b> Check headings</span><i>→</i><span><b>3</b> Verify data</span><i>→</i><span><b>4</b> Import</span></div><div className="ops-upload-body">{children}</div><div className="ops-rule"><span>i</span><div>{rule}</div></div>{message?<PremiumFeedback message={message} tone={/failed|invalid|missing|error|stopped/i.test(message)?"error":/complete|updated|replaced|imported/i.test(message)?"success":"info"}/>:null}</section>
}
export function OpsSectionTitle({title,subtitle,icon="↗",right}:{title:string;subtitle?:string;icon?:string;right?:ReactNode}){return <div className="ops-section-head"><div className="ops-title"><span className="ops-section-icon">{icon}</span><div><h2>{title}</h2>{subtitle?<p>{subtitle}</p>:null}</div></div>{right}</div>}
export function OpsMetric({tone,label,value,note,icon}:{tone:string;label:string;value:string;note?:string;icon?:string}){return <article className={`ops-metric tone-${tone}`}><span className="ops-metric-icon">{icon||"•"}</span><div><span className="ops-metric-label">{label}</span><strong>{value}</strong>{note?<small>{note}</small>:null}</div></article>}
export function OpsDataCard({title,subtitle,count,children}:{title:string;subtitle?:string;count?:string;children:ReactNode}){return <section className="ops-data-card"><div className="ops-data-head"><div><h2>{title}</h2>{subtitle?<p>{subtitle}</p>:null}</div>{count?<span className="ops-count-pill">{count}</span>:null}</div>{children}</section>}
export function OpsTable({children,minWidth=900}:{children:ReactNode;minWidth?:number}){return <div className="ops-table-shell"><div className="ops-table-scroll"><table className="ops-table" style={{minWidth}}>{children}</table></div><TableScrollHint/></div>}
export function PersonCell({name,sub}:{name:string;sub?:string}){return <div className="ops-person"><span>{initials(name)}</span><div><b>{name}</b>{sub?<small>{sub}</small>:null}</div></div>}
export function ProgressCell({value}:{value:number}){return <div className="ops-progress-cell"><div><span style={{width:`${Math.max(0,Math.min(100,value))}%`}}/></div><b>{value}%</b></div>}
export function EmptyState({title,subtitle,icon="info"}:{title:string;subtitle:string;icon?:string}){return <PremiumEmpty title={title} subtitle={subtitle} icon={icon}/>}
export function StatusPill({value}:{value:string}){return <span className={`ops-status ${value.toLowerCase().replace(/\s+/g,"-")}`}>{value}</span>}
function initials(value:string){return (value||"?").trim().split(/\s+/).slice(0,2).map(v=>v[0]).join("").toUpperCase()}

export function OpsFreshness({label,businessDate,uploadedAt,fileName,range}:{label:string;businessDate?:string|null;uploadedAt?:string|null;fileName?:string|null;range?:string}){
 return <div className="ops-freshness-v96"><span className="ops-freshness-dot-v96"/><div><small>LATEST {label.toUpperCase()} DATA</small><strong>{businessDate?new Date(businessDate).toLocaleDateString():"No import yet"}</strong>{range?<em>{range}</em>:null}</div><div className="ops-freshness-file-v96"><span>{fileName||"Upload a source file"}</span><small>{uploadedAt?`Imported ${new Date(uploadedAt).toLocaleString()}`:"No import history available"}</small></div></div>
}
