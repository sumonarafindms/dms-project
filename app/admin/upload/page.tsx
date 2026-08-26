import Link from "next/link";
import {requireUser} from "../../../lib/auth";
import {Icon} from "../../components/icons";

const operational=[
 {key:"ga",title:"GA Upload",sub:"Daily SIM activation report",href:"/ga",sample:"/api/samples/ga",icon:"sim",note:"PRODUCT_CODE + date validation · duplicate-safe SIM import",tone:"blue",tag:"DAILY"},
 {key:"c2c",title:"C2C Upload",sub:"Stock lifting report",href:"/c2c",sample:"/api/samples/c2c",icon:"wallet",note:"Header discovery · cumulative date-wise balance upsert",tone:"violet",tag:"MTD"},
 {key:"c2s",title:"C2S Upload",sub:"Retailer sales report",href:"/c2s",sample:"/api/samples/c2s",icon:"chart",note:"Header discovery · retailer sales + LSO calculation",tone:"cyan",tag:"MTD"},
 {key:"ob",title:"Opening Balance",sub:"Latest balance snapshot",href:"/ob",sample:"/api/samples/ob",icon:"balance",note:"Validated single-date snapshot · safe replacement",tone:"green",tag:"SNAPSHOT"},
];
const control=[
 {key:"retailers",title:"Retailer Master",sub:"Retailer identity & ownership",href:"/admin/upload/retailers",sample:"/api/samples/retailers",icon:"shop",note:"RETAILER_CODE upsert · RSO mapping verification",tone:"amber",tag:"MASTER"},
 {key:"targets",title:"Monthly Targets",sub:"RSO & BP target control",href:"/targets",sample:"/api/samples/targets",icon:"target",note:"Required-heading check · row validation before update",tone:"rose",tag:"MONTHLY"},
];

function ModuleCard({x,index}:{x:(typeof operational)[number]|(typeof control)[number];index:string}){
 return <article className={`upload-module premium-upload-card upload-v61-card tone-${x.tone}`}>
  <div className="upload-v61-card-top"><span className="upload-card-number">{index}</span><span className="upload-v61-tag">{x.tag}</span></div>
  <div className="upload-module-top"><span className="upload-module-icon"><Icon name={x.icon}/></span><div><strong>{x.title}</strong><span>{x.sub}</span></div></div>
  <p>{x.note}</p>
  <div className="upload-v61-validation"><span>✓ Headers</span><span>✓ Data</span><span>✓ Mapping</span></div>
  <div className="upload-module-actions"><Link className="btn admin-primary" href={x.href}>Open Workspace</Link><a className="btn upload-sample-btn" href={x.sample}>Sample</a></div>
 </article>
}

export default async function Page(){
 await requireUser(["ADMIN","IT"]);
 return <main className="page admin-upload-hub premium-upload-hub upload-v61">
  <section className="upload-command upload-v61-command">
   <div className="upload-command-copy"><div className="admin-kicker">DATA OPERATIONS</div><h1 className="upload-hub-title">Upload Center</h1><p className="upload-hub-sub">A controlled import workspace that checks workbook structure first, validates source data second, then writes verified records to DMS.</p><div className="upload-command-badges"><span>Header Check</span><span>Row Validation</span><span>Duplicate Safe</span><span>Database Protected</span></div></div>
   <div className="upload-command-visual"><div className="upload-orbit"><span><Icon name="upload"/></span><b>6</b><small>Validated Modules</small></div></div>
  </section>

  <div className="upload-guidance premium-guidance upload-v61-guidance"><span className="upload-guidance-icon"><Icon name="upload"/></span><div><strong>Upload any supported report confidently</strong><p>DMS first looks for the required headings. If a heading is missing, you will see its exact name. When headings pass, row values, dates, retailer mapping and module-specific rules are verified before import.</p></div><Link href="/api/samples/ga" className="btn btn-ghost">View Sample</Link></div>

  <section className="upload-v61-group">
   <div className="upload-v61-group-head"><div><span>OPERATIONAL FEEDS</span><h2>Daily & month-to-date reporting</h2><p>Field execution source files that feed performance calculations.</p></div><b>4 modules</b></div>
   <div className="premium-upload-grid upload-v61-grid operational">{operational.map((x,i)=><ModuleCard key={x.key} x={x} index={`0${i+1}`}/>)}</div>
  </section>

  <section className="upload-v61-group">
   <div className="upload-v61-group-head"><div><span>CONTROL DATA</span><h2>Master data & targets</h2><p>Reference records that control ownership, mapping and monthly goals.</p></div><b>2 modules</b></div>
   <div className="premium-upload-grid upload-v61-grid control">{control.map((x,i)=><ModuleCard key={x.key} x={x} index={`0${i+5}`}/>)}</div>
  </section>

  <section className="section premium-checklist-section upload-v61-flow"><div className="admin-section-head"><div><span>SAFE IMPORT PIPELINE</span><h2>Validate before anything reaches the database</h2></div></div><div className="upload-checklist premium-checklist">
   <div><b>01</b><span><strong>Read workbook</strong><small>Open the supported Excel/TXT source.</small></span></div>
   <div><b>02</b><span><strong>Check headings</strong><small>List exact missing required columns.</small></span></div>
   <div><b>03</b><span><strong>Verify data</strong><small>Validate dates, codes, values and mappings.</small></span></div>
   <div><b>04</b><span><strong>Import & review</strong><small>Write verified rows and show exact result counts.</small></span></div>
  </div></section>
 </main>
}
