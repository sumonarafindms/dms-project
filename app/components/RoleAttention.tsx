import Link from "next/link";
import type {RetailerOpportunity} from "../../lib/retailer-opportunities";

export function AttentionHero({count,href,label="Needs attention"}:{count:number;href:string;label?:string}){
  return <Link href={href} className={`attention-hero card ${count?"has-alerts":"is-clear"}`}>
    <div className="attention-hero-icon">{count?"!":"✓"}</div>
    <div className="attention-hero-copy"><div className="attention-kicker">{label}</div><strong>{count?`${count} retailer${count===1?"":"s"} need action`:"All current checks look good"}</strong><span>{count?"Open the prioritized list to see exact SSO/LSO gaps.":"No retailer is currently flagged by the active SSO/LSO rules."}</span></div>
    <div className="attention-arrow">›</div>
  </Link>
}

export function RoleAttentionList({rows,base,limit,query=""}:{rows:RetailerOpportunity[];base:string;limit?:number;query?:string}){
 const shown=typeof limit==="number"?rows.slice(0,limit):rows;
 if(!shown.length)return <div className="card empty-state"><div className="empty-state-icon">✓</div><strong>No attention items</strong><span>Current retailer execution rules are complete for this scope.</span></div>;
 return <div className="attention-list">{shown.map(r=><Link key={r.id} href={`${base}/${r.id}${query}`} className="card attention-item">
   <div className="attention-main"><div className="attention-title">{r.retailerName}</div><div className="attention-meta">{r.retailerCode} · {r.employeeName} · {r.route}</div><div className="attention-reasons">{r.reasons.slice(0,2).map(x=><span key={x}>{x}</span>)}</div></div>
   <div className="attention-side"><span className={`priority-badge p${Math.min(5,r.priority)}`}>P{r.priority}</span><small>GA {r.ga} · {r.c2sTransactions} trx</small></div>
  </Link>)}</div>
}
