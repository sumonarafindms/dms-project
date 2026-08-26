import {ReactNode} from "react";

export function PremiumLayoutGrid({children,aside}:{children:ReactNode;aside?:ReactNode}){
 return <div className={`premium-layout-grid-v79 ${aside?"has-aside":""}`}>
  <main>{children}</main>{aside?<aside>{aside}</aside>:null}
 </div>
}
