import Link from "next/link";
import { PageHeader } from "../components/Kit";
const roles = [
  { href: "/dashboard", name: "Admin", desc: "Full system management", icon: "⚙️" },
  { href: "/manager", name: "Manager", desc: "Monitoring & overview", icon: "📊" },
  { href: "/supervisor", name: "Supervisor", desc: "Team management", icon: "👥" },
  { href: "/accounts", name: "Accounts", desc: "Data operations", icon: "🧾" },
  { href: "/rso", name: "RSO", desc: "Field sales app", icon: "📱" },
  { href: "/bp", name: "BP", desc: "SIM sales tracking", icon: "🎯" },
];
export default function Preview() {
  return (
    <main className="page">
      <PageHeader title="Role experiences" subtitle="Preview every role before authentication is connected." />
      <div className="kit-card-grid">
        {roles.map((r) => (
          <Link key={r.href} href={r.href} className="kit-card kit-card-p is-clickable kit-tile">
            <span className="kit-tile-icon" aria-hidden="true">
              {r.icon}
            </span>
            <div>
              <strong>{r.name}</strong>
              <span>{r.desc}</span>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
