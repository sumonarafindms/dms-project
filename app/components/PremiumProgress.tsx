export function PremiumProgress({value,label,tone="indigo",compact=false}:{value:number;label?:string;tone?:string;compact?:boolean}){
 const safe=Math.max(0,Math.min(100,Number.isFinite(value)?value:0));
 return <div className={`premium-progress-v70 tone-${tone} ${compact?"compact":""}`}>
  <div className="premium-progress-head">{label?<span>{label}</span>:<span>Progress</span>}<strong>{safe.toFixed(safe%1?1:0)}%</strong></div>
  <div className="premium-progress-track"><span style={{width:`${safe}%`}}/></div>
 </div>
}
