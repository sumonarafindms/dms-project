import Link from "next/link";
import type {PaceStatus} from "../../lib/intelligence";
import {paceBand} from "../../lib/achievement";

export function PaceCard({label,achieved,target,expected,unit=""}:{label:string;achieved:number;target:number;expected:number;unit?:string}){
 const progress=target?Math.round(achieved/target*100):0;
 const status:PaceStatus=!target?"No target":paceBand(progress,expected);
 const cls=status==="Ahead"?"pace-ahead":status==="On track"?"pace-track":status==="Behind"?"pace-behind":"pace-none";
 return <div className="card pace-card"><div className="pace-card-head"><div><div className="metric-label">{label}</div><div className="pace-value">{unit}{Math.round(achieved).toLocaleString()}</div></div><span className={`pace-pill ${cls}`}>{status}</span></div><div className="progress"><span style={{width:`${Math.min(100,progress)}%`}}/></div><div className="pace-foot"><span>{progress}% achieved</span><span>{target?`${unit}${Math.max(0,target-achieved).toLocaleString()} remaining`:"Target not set"}</span></div></div>
}

export function DailyStrip({ga,gaDate,c2c,c2cDate}:{ga:number;gaDate:Date|null;c2c:number;c2cDate:Date|null}){
 const fmt=(d:Date|null)=>d?d.toISOString().slice(5,10):"No data";
 return <div className="daily-strip card"><div><span>Latest GA</span><strong>{ga.toLocaleString()}</strong><small>{fmt(gaDate)}</small></div><div className="daily-divider"/><div><span>Latest C2C</span><strong>৳{Math.round(c2c).toLocaleString()}</strong><small>{fmt(c2cDate)}</small></div></div>
}

export function RankingList({title,rows,base,month}:{title:string;rows:Array<{employeeId:string;name:string;supervisor:string;score:number;pace:PaceStatus;gaProgress:number;rechargeProgress:number}>;base:string;month:string}){
 return <section className="section"><div className="section-head"><h2 className="section-title">{title}</h2><span className="section-link">Composite pace</span></div><div className="card panel ranking-list">{rows.length?rows.map((r,i)=><Link href={`${base}/${r.employeeId}?month=${month.slice(0,7)}`} className="ranking-row" key={r.employeeId}><div className="rank-no">{i+1}</div><div className="rank-person"><strong>{r.name}</strong><span>{r.supervisor} · GA {r.gaProgress}% · Recharge {r.rechargeProgress}%</span></div><div className="rank-side"><strong>{r.score}</strong><span className={`pace-mini ${r.pace==="Behind"?"behind":r.pace==="Ahead"?"ahead":"track"}`}>{r.pace}</span></div></Link>):<div className="empty">No performance data available.</div>}</div></section>
}
