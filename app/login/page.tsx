"use client";
import {FormEvent,useState} from "react";
import {useRouter} from "next/navigation";

export default function Login(){
 const [error,setError]=useState(""),[busy,setBusy]=useState(false),router=useRouter();
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setBusy(true);setError("");
  const f=new FormData(e.currentTarget);
  try{
   const res=await fetch("/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({identifier:f.get("identifier"),credential:f.get("credential"),admin:false})});
   const d=await res.json();setBusy(false);
   if(!res.ok)return setError(d.error||"Sign in failed");
   router.replace(d.redirect);router.refresh();
  }catch{setBusy(false);setError("Unable to reach the sign-in service. Please try again.")}
 }
 return <main className="auth-v54">
  <section className="auth-v54-brand">
   <div className="auth-v54-brand-top"><div className="auth-v54-logo">D</div><div><strong>DMS</strong><span>Distribution Management System</span></div></div>
   <div className="auth-v54-copy"><span className="auth-v54-kicker">FIELD SALES · DISTRIBUTION · EXECUTION</span><h1>One workspace for your entire distribution team.</h1><p>Monitor performance, manage retailers, maintain operational data and keep field execution connected across every role.</p><div className="auth-v54-role-grid"><div><b>Manager</b><small>Team oversight</small></div><div><b>Supervisor</b><small>Field execution</small></div><div><b>Accounts</b><small>Data operations</small></div><div><b>RSO</b><small>Retailer management</small></div><div><b>BP</b><small>SIM sales</small></div><div><b>IT</b><small>System operations</small></div></div></div>
   <div className="auth-v54-foot"><span>Secure role-based access</span><span>Live operational reporting</span></div>
  </section>
  <section className="auth-v54-panel"><form className="auth-v54-card" onSubmit={submit}>
   <div className="auth-v54-mobile-brand"><div className="auth-v54-logo">D</div><div><strong>DMS</strong><span>Distribution Management System</span></div></div>
   <div className="auth-v58-team-badge">TEAM LOGIN</div>
   <div className="auth-v54-overline">AUTHORIZED TEAM ACCESS</div><h2>Welcome back</h2><p className="auth-v54-intro">Use your authorized mobile number and PIN to continue.</p>
   <label className="auth-v54-field"><span>Mobile Number</span><input name="identifier" required autoComplete="username" placeholder="01XXXXXXXXX" inputMode="tel"/></label>
   <label className="auth-v54-field"><span>PIN</span><input name="credential" required type="password" autoComplete="current-password" placeholder="Enter PIN" inputMode="numeric"/></label>
   {error&&<div className="auth-v54-error">{error}</div>}<button className="auth-v54-submit" disabled={busy}>{busy?"Signing in…":"Sign in"}</button>
   <div className="auth-v54-help"><strong>Authorized team access only</strong><span>Contact your administrator if your account or role mapping needs to be updated.</span></div>
  </form></section>
 </main>
}