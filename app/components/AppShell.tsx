"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "./icons";
import { useEffect, useRef, useState } from "react";
import { PermissionProvider, type ClientPermissionMap } from "./PermissionContext";

/**
 * `group` places the item in the collapsible admin sidebar. It exists because
 * the groups used to be INDEX SLICES of `adminNav` — `adminNav.slice(5, 11)`
 * and so on — which had two consequences:
 *
 *   - Inserting one item anywhere shifted every group after it, silently.
 *   - `AdminNav` closed over `adminNav`, so `itNav` was built, filtered, and
 *     then never rendered. That is why IT could not see the Reporting Center
 *     it defines: the entry existed the whole time and the sidebar drew a
 *     different list.
 *
 * Grouping by a field on the item makes both impossible.
 */
type NavGroup = "Overview" | "Reports" | "Performance" | "Data Operations" | "Management";
/**
 * `group` is optional because the field roles (manager, supervisor, accounts,
 * rso, bp) render a FLAT list and have no groups. It is required in practice for
 * the admin/IT menu, and `tests/nav.smoke.test.ts` asserts that — an ungrouped
 * item there would simply not be drawn, which is the failure this whole change
 * is about.
 */
type NavItem = { href: string; label: string; icon: string; module?: string; group?: NavGroup };
type RoleConfig = { name: string; title: string; initials: string; home: string; nav: NavItem[]; bottom: NavItem[] };
const adminNav: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "home", module: "dashboard", group: "Overview" },
  // Reports were IT-only in the demos, but the routes have always allowed
  // ADMIN too, and an admin who cannot reach the Reporting Center from the
  // menu has to know the URL. Both roles get the group.
  { href: "/it/reports", label: "Reporting Center", icon: "file", module: "dashboard", group: "Reports" },
  { href: "/it/readiness", label: "Data Readiness", icon: "alert", module: "dashboard", group: "Reports" },
  {
    href: "/admin/performance/supervisors",
    label: "Supervisor Performance",
    icon: "users",
    module: "performance",
    group: "Performance",
  },
  {
    href: "/admin/performance/rsos",
    label: "RSO Performance",
    icon: "chart",
    module: "performance",
    group: "Performance",
  },
  { href: "/admin/performance/bps", label: "BP Performance", icon: "sim", module: "performance", group: "Performance" },
  {
    href: "/admin/performance/retailers",
    label: "Retailer Performance",
    icon: "shop",
    module: "performance",
    group: "Performance",
  },
  { href: "/admin/upload", label: "Upload Center", icon: "upload", module: "ga", group: "Data Operations" },
  { href: "/ga", label: "GA Upload", icon: "sim", module: "ga", group: "Data Operations" },
  { href: "/c2c", label: "C2C Upload", icon: "wallet", module: "c2c", group: "Data Operations" },
  { href: "/c2s", label: "C2S Upload", icon: "chart", module: "c2s", group: "Data Operations" },
  { href: "/ob", label: "OB Upload", icon: "balance", module: "ob", group: "Data Operations" },
  {
    href: "/admin/upload/retailers",
    label: "Retailer List",
    icon: "shop",
    module: "retailers",
    group: "Data Operations",
  },
  { href: "/admin/employees", label: "Employees", icon: "users", module: "employees", group: "Management" },
  { href: "/admin/permissions", label: "Permissions", icon: "target", module: "employees", group: "Management" },
  { href: "/admin/audit", label: "Activity Log", icon: "chart", module: "employees", group: "Management" },
  { href: "/targets", label: "Targets", icon: "target", module: "targets", group: "Management" },
  { href: "/admin/attention", label: "Attention Center", icon: "target", module: "attention", group: "Management" },
];
/** ADMIN and IT now share one menu; the routes always allowed both. */
const itNav: NavItem[] = adminNav;
/**
 * The mobile bottom bar, picked BY HREF.
 *
 * It used to be index positions into `adminNav` — `adminNav[11]` — so inserting
 * one menu item quietly changed which five buttons a phone showed.
 */
const pick = (nav: NavItem[], hrefs: string[]) =>
  hrefs.map((h) => nav.find((i) => i.href === h)).filter((i): i is NavItem => Boolean(i));
const ADMIN_BOTTOM = ["/dashboard", "/it/reports", "/admin/performance/rsos", "/admin/upload", "/admin/employees"];
const NAV_GROUPS: { label: NavGroup; icon: string }[] = [
  { label: "Overview", icon: "home" },
  { label: "Reports", icon: "file" },
  { label: "Performance", icon: "chart" },
  { label: "Data Operations", icon: "upload" },
  { label: "Management", icon: "users" },
];
const configs: Record<string, RoleConfig> = {
  admin: {
    name: "DMS Admin",
    title: "Administrator",
    initials: "SA",
    home: "/dashboard",
    nav: adminNav,
    bottom: pick(adminNav, ADMIN_BOTTOM),
  },
  manager: {
    name: "Manager",
    title: "Monitoring & overview",
    initials: "MG",
    home: "/manager",
    nav: [
      { href: "/manager", label: "Overview", icon: "home", module: "dashboard" },
      { href: "/manager/attention", label: "Attention", icon: "target", module: "attention" },
      { href: "/manager/supervisors", label: "Supervisors", icon: "users", module: "employees" },
      { href: "/manager/rsos", label: "RSOs", icon: "chart", module: "performance" },
      { href: "/manager/bp-activations", label: "BP Activations", icon: "sim", module: "bp" },
    ],
    bottom: [],
  },
  supervisor: {
    name: "Supervisor",
    title: "Team management",
    initials: "SP",
    home: "/supervisor",
    nav: [
      { href: "/supervisor", label: "Overview", icon: "home", module: "dashboard" },
      { href: "/supervisor/attention", label: "Attention", icon: "target", module: "attention" },
      { href: "/supervisor/rsos", label: "My RSOs", icon: "users", module: "employees" },
      { href: "/supervisor/retailers", label: "Retailers", icon: "shop", module: "retailers" },
      { href: "/supervisor/bp-activations", label: "BP Activations", icon: "sim", module: "bp" },
    ],
    bottom: [],
  },
  accounts: {
    name: "Accounts",
    title: "Data management",
    initials: "AC",
    home: "/accounts",
    nav: [
      { href: "/accounts", label: "Overview", icon: "home", module: "dashboard" },
      { href: "/accounts/operations", label: "Operations", icon: "upload", module: "ga" },
      { href: "/accounts/retailers", label: "Retailer Search", icon: "search", module: "retailers" },
      { href: "/accounts/attention", label: "Opportunity", icon: "target", module: "attention" },
      { href: "/accounts/people", label: "RSO & BP", icon: "users", module: "employees" },
      { href: "/accounts/operations/targets", label: "SC & Targets", icon: "target", module: "targets" },
    ],
    bottom: [],
  },
  rso: {
    name: "RSO",
    title: "Field sales",
    initials: "RS",
    home: "/rso",
    nav: [
      { href: "/rso", label: "Home", icon: "home", module: "dashboard" },
      // SSO and LSO are the RSO's daily worklists in the approved demo, so they sit
      // above the general Attention page rather than buried under it.
      { href: "/rso/sso", label: "SSO", icon: "phone", module: "attention" },
      { href: "/rso/lso", label: "LSO", icon: "chart", module: "attention" },
      { href: "/rso/attention", label: "Attention", icon: "target", module: "attention" },
      { href: "/rso/retailers", label: "Retailers", icon: "shop", module: "retailers" },
      { href: "/rso/bp", label: "My BP", icon: "users", module: "bp" },
      { href: "/rso/bp/activations", label: "BP Activations", icon: "sim", module: "bp" },
    ],
    bottom: [],
  },
  bp: {
    name: "BP",
    title: "SIM sales",
    initials: "BP",
    home: "/bp",
    nav: [
      { href: "/bp", label: "Home", icon: "home", module: "dashboard" },
      { href: "/bp/sales", label: "Sales", icon: "sim", module: "ga" },
    ],
    bottom: [],
  },
  // IT is Admin plus the Reporting Center — the one thing that distinguishes
  // the role in the approved demos. The route itself allows ADMIN too; only the
  // nav entry is IT-only, so Admin can still reach it by URL.
  it: {
    name: "DMS IT",
    title: "IT Administration",
    initials: "IT",
    home: "/dashboard",
    nav: itNav,
    bottom: pick(itNav, ADMIN_BOTTOM),
  },
};
for (const key of ["manager", "supervisor", "accounts", "rso", "bp"])
  configs[key].bottom = configs[key].nav.slice(0, 4);
configs.manager.bottom = configs.manager.nav;
configs.supervisor.bottom = configs.supervisor.nav;
configs.rso.bottom = configs.rso.nav;
configs.accounts.bottom = configs.accounts.nav;
function roleFor(path: string) {
  const first = path.split("/").filter(Boolean)[0] || "";
  return configs[first] || configs.admin;
}
function active(path: string, href: string) {
  const homes = new Set(["/dashboard", "/manager", "/supervisor", "/accounts", "/rso", "/bp"]);
  if (homes.has(href)) return path === href;
  return path === href || (href !== "/" && path.startsWith(href + "/"));
}
function allowed(item: NavItem, permissions: ClientPermissionMap, admin: boolean) {
  if (admin) return true;
  if (item.href === "/accounts/operations")
    return ["ga", "c2c", "c2s", "ob", "targets"].some((m) => permissions[m]?.view);
  return !item.module || Boolean(permissions[item.module]?.view);
}
export default function AppShell({
  children,
  user,
  permissions,
}: {
  children: React.ReactNode;
  user: { displayName: string; role: string } | null;
  permissions: ClientPermissionMap;
}) {
  const path = usePathname();
  const router = useRouter();
  const [navPending, setNavPending] = useState<string | null>(null);
  const sidebarRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    setNavPending(null);
  }, [path]);
  useEffect(() => {
    const node = sidebarRef.current;
    const saved = sessionStorage.getItem("dms_sidebar_scroll");
    if (saved && node) node.scrollTop = Number(saved) || 0;
    return () => {
      if (node) sessionStorage.setItem("dms_sidebar_scroll", String(node.scrollTop));
    };
  }, []);
  // Warm only the routes THIS role can actually open. The old version warmed
  // the first six admin routes for everyone, so an RSO on a phone prefetched
  // Supervisor Performance, the Upload Center and GA Upload — server renders
  // and bandwidth spent on pages that role cannot reach.
  const warmKey = user?.role?.toLowerCase() || "";
  useEffect(() => {
    const role = configs[warmKey] || roleFor(path);
    const warm = [role.home, ...role.nav.slice(0, 4).map((i) => i.href)];
    for (const href of new Set(warm)) router.prefetch(href);
  }, [path, router, warmKey]);
  if (path === "/login" || path === "/setup" || path === "/sacool")
    return <PermissionProvider permissions={permissions}>{children}</PermissionProvider>;
  const roleKey = user?.role.toLowerCase() || path.split("/").filter(Boolean)[0] || "admin",
    role = user ? configs[roleKey] || roleFor(path) : roleFor(path),
    profileName = user?.displayName || role.name;
  const roleName = (user?.role || "").toUpperCase();
  // Decided by the AUTHENTICATED ROLE, not the URL. `isAdmin` grants every nav
  // item regardless of the permission map (see `allowed`), so letting a path
  // like /admin/... set it meant the shell briefly offered the full admin menu
  // to whoever loaded that URL. The server still refuses the data, but the
  // chrome should never claim access the user does not have. When there is no
  // session yet, fall back to the path so the pre-auth shell still renders.
  const isAdmin = user
    ? roleName === "ADMIN" || roleName === "IT"
    : path === "/dashboard" || path.startsWith("/admin/");
  const visibleNav = role.nav.filter((i) => allowed(i, permissions, isAdmin));
  const visibleBottom = role.bottom.filter((i) => allowed(i, permissions, isAdmin));
  return (
    <PermissionProvider permissions={permissions}>
      <div className={`app-root ${isAdmin ? "admin-app" : `${roleKey}-app`}`}>
        <aside ref={sidebarRef} className={`desktop-sidebar ${navPending ? "nav-is-pending" : ""}`}>
          <div className="sidebar-brand">
            <Brand href={role.home} />
          </div>
          <div className="sidebar-section">{role.title}</div>
          {isAdmin ? (
            <AdminNav nav={role.nav} path={path} permissions={permissions} onNavigate={setNavPending} />
          ) : (
            visibleNav.map((i) => <NavLink key={i.href} item={i} path={path} onNavigate={setNavPending} />)
          )}
          <div className="sidebar-spacer" />
          <button
            className="sidebar-link sidebar-button"
            aria-label="Sign out"
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              location.href = "/login";
            }}
          >
            <Icon name="logout" />
            Sign out
          </button>
          <div className="sidebar-profile">
            <div className="avatar">{role.initials}</div>
            <div>
              <div className="profile-name">{profileName}</div>
              <div className="profile-role">{role.title}</div>
            </div>
          </div>
        </aside>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <div className="app-main" id="main-content">
          <header className="mobile-topbar">
            <div className="mobile-context">
              <Brand href={role.home} />
              <span>{currentLabel(path, visibleNav, role.home)}</span>
            </div>
            <Link href={role.home} className="avatar avatar-link" aria-label={`${role.title} home`}>
              {role.initials}
            </Link>
          </header>
          {children}
        </div>
        {visibleBottom.length > 0 && (
          // The count is whatever the signed-in role can see; the classes for
          // 2..6 are in kit.css, and anything outside that keeps the stylesheet's
          // own default rather than falling back to an inline style.
          <nav className={`bottom-nav is-cols-${Math.min(6, Math.max(2, visibleBottom.length))}`}>
            {visibleBottom.map((i) => (
              <Link
                key={i.href}
                href={i.href}
                prefetch={true}
                onPointerEnter={() => router.prefetch(i.href)}
                onClick={() => setNavPending(i.href)}
                className={`bottom-link ${active(path, i.href) ? "active" : ""}`}
              >
                <Icon name={i.icon} />
                <span>{i.label}</span>
              </Link>
            ))}
          </nav>
        )}
      </div>
    </PermissionProvider>
  );
}
/**
 * The admin/IT sidebar: the role's OWN nav list, grouped.
 *
 * `nav` is a parameter rather than a closed-over constant. The previous version
 * read `adminNav` directly, so every role that reached this component saw the
 * admin menu whatever its config said — which is precisely how IT lost its
 * Reporting Center entry.
 */
function AdminNav({
  nav,
  path,
  permissions,
  onNavigate,
}: {
  nav: NavItem[];
  path: string;
  permissions: ClientPermissionMap;
  onNavigate: (href: string) => void;
}) {
  const groups = NAV_GROUPS.map((g) => ({ ...g, items: nav.filter((i) => i.group === g.label) }));
  return (
    <nav className="admin-sidebar-nav">
      {groups.map((g) => {
        const items = g.items.filter((i) => allowed(i, permissions, true));
        if (!items.length) return null;
        const groupActive = items.some((i) => active(path, i.href));
        return (
          <details
            className={`admin-nav-group ${groupActive ? "group-active" : ""}`}
            open={groupActive || g.label === "Overview"}
            key={g.label}
          >
            <summary>
              <span>
                <Icon name={g.icon} />
                {g.label}
              </span>
              <b>⌄</b>
            </summary>
            <div className="admin-nav-items">
              {items.map((i) => (
                <NavLink key={i.href} item={i} path={path} onNavigate={onNavigate} />
              ))}
            </div>
          </details>
        );
      })}
    </nav>
  );
}
function currentLabel(path: string, nav: NavItem[], home: string) {
  if (path === home) return "Overview";
  const exact = [...nav].sort((a, b) => b.href.length - a.href.length).find((i) => active(path, i.href));
  return exact?.label || "DMS";
}
function Brand({ href }: { href: string }) {
  return (
    <Link href={href} className="brand">
      <div className="brand-mark">D</div>
      <div>
        <div className="brand-title">DMS</div>
        <div className="brand-sub">Distribution Management</div>
      </div>
    </Link>
  );
}
function NavLink({ item, path, onNavigate }: { item: NavItem; path: string; onNavigate: (href: string) => void }) {
  const router = useRouter();
  const isActive = active(path, item.href);
  return (
    <Link
      href={item.href}
      prefetch={true}
      aria-current={isActive ? "page" : undefined}
      onPointerEnter={() => router.prefetch(item.href)}
      onFocus={() => router.prefetch(item.href)}
      onClick={() => {
        if (!isActive) onNavigate(item.href);
      }}
      className={`sidebar-link ${isActive ? "active" : ""}`}
    >
      <Icon name={item.icon} />
      <span className="sidebar-link-label">{item.label}</span>
    </Link>
  );
}
