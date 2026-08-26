import {Icon} from "./icons";

export function NavContext({icon="arrow",children}:{icon?:string;children:React.ReactNode}){
 return <span className="nav-context-v69"><Icon name={icon}/>{children}</span>
}
