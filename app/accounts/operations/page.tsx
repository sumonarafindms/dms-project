import {requireUser} from "../../../lib/auth";
import {permissionsFor} from "../../../lib/permissions";
import {AccountsSection,AccountsAction} from "../../components/AccountsUI";

export default async function Page(){
 const u=await requireUser(["ACCOUNTS"]),permissions=await permissionsFor(u.id,u.role);
 const actions=[
  permissions.ga?.view&&<AccountsAction key="ga" href="/accounts/operations/ga" icon="sim" title="GA Activation" sub="Upload activation workbook and review GA" tone="blue"/>,
  permissions.c2c?.view&&<AccountsAction key="c2c" href="/accounts/operations/c2c" icon="wallet" title="C2C Stock Lifting" sub="Upload stock-lifting report" tone="violet"/>,
  permissions.c2s?.view&&<AccountsAction key="c2s" href="/accounts/operations/c2s" icon="chart" title="C2S Retail Sales" sub="Import cumulative retailer sales" tone="cyan"/>,
  permissions.ob?.view&&<AccountsAction key="ob" href="/accounts/operations/ob" icon="balance" title="Opening Balance" sub="Maintain latest balance snapshot" tone="green"/>,
  permissions.targets?.view&&<AccountsAction key="targets" href="/accounts/operations/targets" icon="target" title="SC & Targets" sub="Monthly target and SC control" tone="orange"/>
 ].filter(Boolean);
 return <main className="page accounts-v12-page accounts-ops-v12">
  <section className="accounts-v12-subhero"><div><div className="accounts-v12-kicker">DATA PIPELINE</div><h1>Operations Center</h1><p>Import, validate and maintain the daily datasets that power every role dashboard.</p></div><div className="accounts-v12-substat"><span>AVAILABLE MODULES</span><strong>{actions.length}</strong><small>Based on your permissions</small></div></section>
  <div className="accounts-v12-rule"><b>Import protection</b><span>Duplicate detection, mapping checks and source validation remain active in each module.</span></div>
  <section className="accounts-v12-section"><AccountsSection eyebrow="CHOOSE WORKFLOW" title="Data operations" sub="Open the source you need to update."/><div className="accounts-v12-actions accounts-v12-ops-grid">{actions}</div></section>
 </main>
}