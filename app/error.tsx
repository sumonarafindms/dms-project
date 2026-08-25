"use client";
import {useEffect} from "react";
export default function Error({error,reset}:{error:Error&{digest?:string};reset:()=>void}){
 useEffect(()=>{console.error(error)},[error]);
 return <main className="system-state-v13"><div className="system-state-card"><div className="system-state-icon error">!</div><div className="system-state-kicker">SOMETHING WENT WRONG</div><h1>We couldn't load this page.</h1><p>The data service may be temporarily unavailable, or this request could not be completed.</p><div className="system-state-actions"><button onClick={reset}>Try again</button><a href="/">Go to home</a></div>{error.digest&&<small>Reference: {error.digest}</small>}</div></main>
}