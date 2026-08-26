import {ReactNode} from "react";

export function PageStack({children,className=""}:{children:ReactNode;className?:string}){
 return <div className={`page-stack-v81 ${className}`}>{children}</div>;
}
