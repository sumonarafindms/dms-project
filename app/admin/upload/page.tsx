import Link from "next/link";
import {requireUser} from "../../../lib/auth";
import {Icon} from "../../components/icons";

const uploads=[
 {key:"ga",title:"GA Upload",sub:"Daily SIM activation report",href:"/ga",sample:"/api/samples/ga",icon:"sim",note:"Date-selected daily file · SIM_NO duplicate protection"},
 {key:"c2c",title:"C2C Upload",sub:"Month-to-date stock lifting",href:"/c2c",sample:"/api/samples/c2c",icon:"wallet",note:"Cumulative report · date-wise upsert"},
 {key:"c2s",title:"C2S Upload",sub:"Month-to-date retailer sales",href:"/c2s",sample:"/api/samples/c2s",icon:"chart",note:"Drives LSO calculation"},
 {key:"ob",title:"Opening Balance",sub:"Latest retailer balance snapshot",href:"/ob",sample:"/api/samples/ob",icon:"balance",note:"Latest snapshot only · old OB replaced"},
 {key:"retailers",title:"Retailer List",sub:"Add or update retailer master",href:"/admin/upload/retailers",sample:"/api/samples/retailers",icon:"shop",note:"RETAILER_CODE upsert · RSO auto mapping"},
];
export default async function Page(){
 await requireUser(["ADMIN"]);
 return <main className="page admin-upload-hub"><div className="admin-kicker">DATA OPERATIONS</div><h1 className="upload-hub-title">Upload Center</h1><p className="upload-hub-sub">Import operational files with the correct format, validation and clear status feedback.</p>
 <div className="upload-guidance card"><span className="upload-guidance-icon"><Icon name="upload"/></span><div><strong>Use the sample file before your first upload</strong><p>Each sample contains the exact headers currently expected by the DMS parser. Keep header names unchanged.</p></div></div>
 <div className="upload-hub-grid">{uploads.map(x=><div className="card upload-module" key={x.key}><div className="upload-module-top"><span className="upload-module-icon"><Icon name={x.icon}/></span><div><strong>{x.title}</strong><span>{x.sub}</span></div></div><p>{x.note}</p><div className="upload-module-actions"><Link className="btn admin-primary" href={x.href}>Open Upload</Link><a className="btn upload-sample-btn" href={x.sample}>Download Sample</a></div></div>)}</div>
 <section className="section"><div className="admin-section-head"><div><span>UPLOAD CHECKLIST</span><h2>Before processing a file</h2></div></div><div className="upload-checklist card"><div><b>1</b><span>Download the correct sample</span></div><div><b>2</b><span>Keep required header names unchanged</span></div><div><b>3</b><span>Check dates and retailer codes</span></div><div><b>4</b><span>Upload and review validation feedback</span></div></div></section></main>
}
