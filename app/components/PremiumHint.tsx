import {Icon} from "./icons";

export function PremiumHint({text,icon="info"}:{text:string;icon?:string}){
 return <span className="premium-hint-v74" tabIndex={0} aria-label={text}>
  <Icon name={icon}/>
  <span className="premium-hint-popover">{text}</span>
 </span>
}
