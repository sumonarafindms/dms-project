import type {ReactNode} from "react";

export function WorkspaceSection({
  eyebrow,
  title,
  description,
  action,
  children,
  className="",
}:{
  eyebrow?:string;
  title:string;
  description?:string;
  action?:ReactNode;
  children:ReactNode;
  className?:string;
}){
  return <section className={`workspace-section-v94 ${className}`}>
    <header className="workspace-section-head-v94">
      <div>
        {eyebrow&&<span>{eyebrow}</span>}
        <h2>{title}</h2>
        {description&&<p>{description}</p>}
      </div>
      {action&&<div className="workspace-section-action-v94">{action}</div>}
    </header>
    <div className="workspace-section-body-v94">{children}</div>
  </section>
}
