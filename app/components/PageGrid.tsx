import {ReactNode} from "react";

export function PageGrid({children,columns=1,className=""}:{children:ReactNode;columns?:1|2|3|4;className?:string}){
 const mode=columns===2?"two":columns===3?"three":columns===4?"four":"";
 return <div className={`page-grid-v81 ${mode} ${className}`.trim()}>{children}</div>;
}
