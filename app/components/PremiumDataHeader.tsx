export function PremiumDataHeader({title,subtitle,count,children}:{title:string;subtitle?:string;count?:number|string;children?:React.ReactNode}){
 return <div className="premium-data-header-v71">
  <div><h2>{title}</h2>{subtitle?<p>{subtitle}</p>:null}</div>
  <div className="premium-data-header-actions">{count!==undefined?<span className="result-count">{count} results</span>:null}{children}</div>
 </div>
}
