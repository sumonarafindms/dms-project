import {Icon} from "./icons";

export function PremiumBadge({icon="check",children,tone="indigo"}:{icon?:string;children:React.ReactNode;tone?:string}){
 return <span className={`premium-badge-v65 tone-${tone}`}><Icon name={icon}/>{children}</span>
}
