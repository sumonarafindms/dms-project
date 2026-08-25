import Link from "next/link";
import {PageHead} from "../components/RoleUI";
const roles=[
 {href:"/dashboard",name:"Admin",desc:"Full system management",icon:"⚙️"},{href:"/manager",name:"Manager",desc:"Monitoring & overview",icon:"📊"},{href:"/supervisor",name:"Supervisor",desc:"Team management",icon:"👥"},{href:"/accounts",name:"Accounts",desc:"Data operations",icon:"🧾"},{href:"/rso",name:"RSO",desc:"Field sales app",icon:"📱"},{href:"/bp",name:"BP",desc:"SIM sales tracking",icon:"🎯"},
];
export default function Preview(){return <main className="page"><PageHead eyebrow="UI Preview" title="Role experiences" subtitle="Preview every role before authentication is connected."/><div className="role-picker">{roles.map(r=><Link key={r.href} href={r.href} className="card role-choice"><div className="role-emoji">{r.icon}</div><div><div className="role-choice-name">{r.name}</div><div className="role-choice-desc">{r.desc}</div></div><span>→</span></Link>)}</div></main>}
