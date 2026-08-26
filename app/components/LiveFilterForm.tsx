"use client";
import {FormEvent,ReactNode,useRef} from "react";

export function LiveFilterForm({className="",children,delay=280}:{className?:string;children:ReactNode;delay?:number}){
 const formRef=useRef<HTMLFormElement>(null);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null);

 function queue(e:FormEvent<HTMLFormElement>){
  const el=e.target as HTMLInputElement|HTMLSelectElement;
  if(!el?.name)return;
  if(timer.current)clearTimeout(timer.current);
  const instant=el instanceof HTMLSelectElement||el.type==="date"||el.type==="month";
  timer.current=setTimeout(()=>formRef.current?.requestSubmit(),instant?40:delay);
 }

 return <form ref={formRef} className={className} onInput={queue} onChange={queue}>{children}</form>
}
