export default function Loading(){
 return <main className="page route-loading-v89" aria-live="polite" aria-busy="true">
  <div className="route-loading-bar-v89"/>
  <div className="route-loading-head-v89"><span/><div><b/><i/></div></div>
  <div className="route-loading-grid-v89">{[1,2,3,4].map(x=><div key={x}/>)}</div>
 </main>
}
