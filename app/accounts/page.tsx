import {requirePagePermission} from "../../lib/auth";
import {prisma} from "../../lib/prisma";
import {latestDailySnapshot} from "../../lib/intelligence";
import {AccountsHero,AccountsSection,AccountsAction,AccountsStat} from "../components/AccountsUI";

export default async function Accounts(){
 const u=await requirePagePermission(["ACCOUNTS"],"dashboard");
 const [rsos,retailers,bps,daily,lastC2s,lastOb]=await Promise.all([
  prisma.employee.count({where:{active:true}}),
  prisma.retailer.count({where:{active:true}}),
  prisma.user.count({where:{role:"BP",active:true}}),
  latestDailySnapshot(),
  prisma.importBatch.findFirst({where:{type:"C2S"},orderBy:{uploadedAt:"desc"},select:{businessDate:true,uploadedAt:true,status:true}}),
  prisma.importBatch.findFirst({where:{type:"OB"},orderBy:{uploadedAt:"desc"},select:{businessDate:true,uploadedAt:true,status:true}})
 ]);
 const gaDate=daily.gaDate?daily.gaDate.toISOString().slice(0,10):"No data",c2cDate=daily.c2cDate?daily.c2cDate.toISOString().slice(0,10):"No data";
 return <main className="page accounts-v12-page">
  <AccountsHero name={u.displayName} latestGa={gaDate} latestC2c={c2cDate} retailers={retailers} rsos={rsos}/>
  <section className="accounts-v12-section"><AccountsSection eyebrow="CURRENT STATUS" title="Data health" sub="Quick checks before daily field reports are consumed."/><div className="accounts-v12-stats">
   <AccountsStat label="Latest GA" value={daily.gaTotal.toLocaleString()} sub={gaDate} tone="blue"/>
   <AccountsStat label="Latest C2C" value={`৳${Math.round(daily.c2cTotal).toLocaleString()}`} sub={c2cDate} tone="violet"/>
   <AccountsStat label="C2S Import" value={lastC2s?.businessDate?lastC2s.businessDate.toISOString().slice(5,10):"—"} sub={lastC2s?.status||"No import"} tone="green"/>
   <AccountsStat label="Opening Balance" value={lastOb?.businessDate?lastOb.businessDate.toISOString().slice(5,10):"—"} sub={lastOb?.status||"No snapshot"} tone="orange"/>
  </div></section>
  <section className="accounts-v12-main-grid"><div><AccountsSection eyebrow="DAILY OPERATIONS" title="Import & maintain" sub="Use the source-specific workflow for each data type."/><div className="accounts-v12-actions">
   <AccountsAction href="/accounts/operations/ga" icon="sim" title="GA Activation" sub="Import activation details and review daily GA" tone="blue"/>
   <AccountsAction href="/accounts/operations/c2c" icon="wallet" title="C2C Stock Lifting" sub="Import retailer lifting and recharge data" tone="violet"/>
   <AccountsAction href="/accounts/operations/c2s" icon="chart" title="C2S Retail Sales" sub="Update retailer sales and LSO progress" tone="cyan"/>
   <AccountsAction href="/accounts/operations/ob" icon="balance" title="Opening Balance" sub="Replace latest retailer balance snapshot" tone="green"/>
   <AccountsAction href="/accounts/operations/targets" icon="target" title="SC & Targets" sub="Maintain monthly RSO and BP targets" tone="orange"/>
  </div></div>
  <aside><AccountsSection eyebrow="REFERENCE" title="Lookup tools"/><div className="accounts-v12-side-actions">
   <AccountsAction href="/accounts/retailers" icon="search" title="Retailer Search" sub={`${retailers.toLocaleString()} active outlets`} tone="blue"/>
   <AccountsAction href="/accounts/attention" icon="target" title="Opportunity" sub="Find unfinished SSO / LSO execution" tone="rose"/>
   <AccountsAction href="/accounts/people" icon="users" title="RSO & BP Reference" sub={`${rsos} RSOs · ${bps} BP logins`} tone="violet"/>
  </div></aside></section>
 </main>
}