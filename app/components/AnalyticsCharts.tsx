type ChartDatum={label:string;value:number;secondary?:number;meta?:string};

const clamp=(n:number)=>Math.max(0,Math.min(100,n));

export function RankedBarChart({title,subtitle,data,valueSuffix="%",maxValue=100}:{title:string;subtitle:string;data:ChartDatum[];valueSuffix?:string;maxValue?:number}){
 const rows=data.slice(0,8),max=Math.max(maxValue,...rows.map(x=>x.value),1);
 return <section className="analytics-card-v90">
  <header><div><span>ANALYTICS</span><h3>{title}</h3><p>{subtitle}</p></div></header>
  <div className="analytics-bars-v90">
   {rows.length?rows.map((x,i)=><div className="analytics-bar-row-v90" key={`${x.label}-${i}`}>
    <div className="analytics-bar-label-v90"><b>{x.label}</b><small>{x.meta||""}</small></div>
    <div className="analytics-bar-track-v90"><span style={{width:`${clamp(x.value/max*100)}%`}}/></div>
    <strong>{Math.round(x.value).toLocaleString()}{valueSuffix}</strong>
   </div>):<div className="analytics-empty-v90">No data available for this period.</div>}
  </div>
 </section>
}

export function ComparisonChart({title,subtitle,data}:{title:string;subtitle:string;data:ChartDatum[]}){
 const rows=data.slice(0,6);
 return <section className="analytics-card-v90">
  <header><div><span>COMPARISON</span><h3>{title}</h3><p>{subtitle}</p></div><div className="analytics-legend-v90"><i/>Recharge <i/>GA</div></header>
  <div className="analytics-compare-v90">
   {rows.length?rows.map((x,i)=><div className="analytics-compare-row-v90" key={`${x.label}-${i}`}>
    <div><b>{x.label}</b><small>{x.meta||""}</small></div>
    <div className="analytics-dual-v90">
     <span><i style={{width:`${clamp(x.value)}%`}}/></span>
     <span className="alt"><i style={{width:`${clamp(x.secondary||0)}%`}}/></span>
    </div>
    <strong>{Math.round(x.value)}%</strong>
   </div>):<div className="analytics-empty-v90">No team data available.</div>}
  </div>
 </section>
}
