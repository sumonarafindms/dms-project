import Link from "next/link";
import {requireUser} from "../../../lib/auth";
import {Icon} from "../../components/icons";

const uploads=[
 {key:"ga",title:"GA Upload",sub:"Daily SIM activation report",href:"/ga",sample:"/api/samples/ga",icon:"sim",note:"Date-selected daily file · SIM_NO duplicate protection",tone:"blue"},
 {key:"c2c",title:"C2C Upload",sub:"Stock lifting report",href:"/c2c",sample:"/api/samples/c2c",icon:"wallet",note:"Cumulative report · date-wise upsert",tone:"violet"},
 {key:"c2s",title:"C2S Upload",sub:"Retailer sales report",href:"/c2s",sample:"/api/samples/c2s",icon:"chart",note:"Retail sales · LSO calculation",tone:"cyan"},
 {key:"ob",title:"Opening Balance",sub:"Latest balance snapshot",href:"/ob",sample:"/api/samples/ob",icon:"balance",note:"Latest snapshot only · previous OB replaced",tone:"green"},
 {key:"retailers",title:"Retailer List",sub:"Retailer master data",href:"/admin/upload/retailers",sample:"/api/samples/retailers",icon:"shop",note:"RETAILER_CODE upsert · RSO auto mapping",tone:"amber"},
 {key:"targets",title:"Target Upload",sub:"Monthly RSO & BP targets",href:"/targets",sample:"/api/samples/targets",icon:"target",note:"Month-based targets · editable after import",tone:"rose"},
];
export default async function Page(){
 await requireUser(["ADMIN"]);
 return <main className="page admin-upload-hub premium-upload-hub">
  <section className="upload-command">
   <div className="upload-command-copy"><div className="admin-kicker">DATA OPERATIONS</div><h1 className="upload-hub-title">Upload Center</h1><p className="upload-hub-sub">A single workspace for operational imports, master data and monthly targets.</p><div className="upload-command-badges"><span>Excel Ready</span><span>Validation Enabled</span><span>Duplicate Safe</span></div></div>
   <div className="upload-command-visual"><div className="upload-orbit"><span><Icon name="upload"/></span><b>6</b><small>Upload Modules</small></div></div>
  </section>

  <div className="upload-guidance premium-guidance"><span className="upload-guidance-icon"><Icon name="upload"/></span><div><strong>Start with the sample file</strong><p>Download the exact template, keep headers unchanged, then upload your completed workbook.</p></div><Link href="/admin/upload/retailers" className="btn btn-ghost">Master Data</Link></div>

  <div className="premium-upload-grid">{uploads.map((x,i)=><article className={`upload-module premium-upload-card tone-${x.tone} ${i===0?"featured-upload":""}`} key={x.key}>
   <div className="upload-card-number">0{i+1}</div>
   <div className="upload-module-top"><span className="upload-module-icon"><Icon name={x.icon}/></span><div><strong>{x.title}</strong><span>{x.sub}</span></div></div>
   <p>{x.note}</p>
   <div className="upload-module-actions"><Link className="btn admin-primary" href={x.href}>Open Module</Link><a className="btn upload-sample-btn" href={x.sample}>Sample</a></div>
  </article>)}</div>

  <section className="section premium-checklist-section"><div className="admin-section-head"><div><span>SAFE IMPORT FLOW</span><h2>Four steps to a clean upload</h2></div></div><div className="upload-checklist premium-checklist">
   <div><b>01</b><span><strong>Download template</strong><small>Use the latest sample workbook.</small></span></div>
   <div><b>02</b><span><strong>Prepare data</strong><small>Keep required headers unchanged.</small></span></div>
   <div><b>03</b><span><strong>Validate</strong><small>Check dates, codes and file type.</small></span></div>
   <div><b>04</b><span><strong>Import & review</strong><small>Confirm result counts after upload.</small></span></div>
  </div></section>
 </main>
}