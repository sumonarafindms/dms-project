"use client";
import {FormEvent,useState} from "react";
import {useRouter} from "next/navigation";

export default function AdminAccess(){
 const [error,setError]=useState(""),[busy,setBusy]=useState(false),router=useRouter();
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setBusy(true);setError("");
  const f=new FormData(e.currentTarget);
  try{
   const res=await fetch("/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({identifier:f.get("identifier"),credential:f.get("credential"),admin:true})});
   const d=await res.json();setBusy(false);
   if(!res.ok)return setError(d.error||"Sign in failed");
   router.replace(d.redirect);router.refresh();
  }catch{setBusy(false);setError("Unable to reach the sign-in service. Please try again.")}
 }
 return <main className="sacool-v58">
  <section className="sacool-v58-card">
   <div className="sacool-v58-mark">D</div><div className="sacool-v58-kicker">RESTRICTED SYSTEM ACCESS</div><h1>Administrator Access</h1><p>This page is reserved for authorized DMS administrators.</p>
   <form onSubmit={submit}><label><span>Username / Mobile Number</span><input name="identifier" required autoComplete="username" placeholder="Administrator ID"/></label><label><span>Password</span><input name="credential" type="password" required autoComplete="current-password" placeholder="Enter password"/></label>{error&&<div className="auth-v54-error">{error}</div>}<button disabled={busy}>{busy?"Authenticating…":"Continue securely"}</button></form>
  </section>
 </main>
}