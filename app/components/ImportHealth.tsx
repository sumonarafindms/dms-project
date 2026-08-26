import {Icon} from "./icons";

type HealthItem={
  type:string;
  label:string;
  fileName?:string|null;
  uploadedAt?:Date|null;
  businessDate?:Date|null;
  successRows?:number;
  failedRows?:number;
  duplicateRows?:number;
  status?:string|null;
};

function day(value?:Date|null){return value?value.toISOString().slice(0,10):"—"}
function stamp(value?:Date|null){return value?value.toLocaleString("en-GB",{timeZone:"Asia/Dhaka",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}):"No import yet"}

export function ImportHealthGrid({items}:{items:HealthItem[]}){
 return <div className="import-health-grid-v96">{items.map(item=><article className="import-health-card-v96" key={item.type}>
  <div className="import-health-top-v96"><span className="import-health-icon-v96"><Icon name={item.type==="GA"?"sim":item.type==="C2C"?"wallet":item.type==="C2S"?"chart":"balance"}/></span><div><small>{item.type}</small><strong>{item.label}</strong></div><b className={`import-health-status-v96 ${(item.status||"none").toLowerCase()}`}>{item.status||"NO DATA"}</b></div>
  <div className="import-health-file-v96"><span>Latest file</span><strong title={item.fileName||""}>{item.fileName||"No import yet"}</strong></div>
  <div className="import-health-meta-v96"><div><span>Report end</span><b>{day(item.businessDate)}</b></div><div><span>Uploaded</span><b>{stamp(item.uploadedAt)}</b></div></div>
  <div className="import-health-counts-v96"><span><b>{item.successRows||0}</b> saved</span><span><b>{item.duplicateRows||0}</b> duplicate</span><span className={(item.failedRows||0)>0?"warn":""}><b>{item.failedRows||0}</b> failed</span></div>
 </article>)}</div>
}
