"use client";
import { AppLink as Link } from "./AppLink";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "./icons";
import { QuickSearch } from "./QuickSearch";
import { FeedbackProvider } from "./Feedback";
import { NoticeStrip } from "./NoticeViews";
import type { NoticeView } from "@/lib/notice-rules";
import { useEffect, useRef, useState } from "react";
import { PermissionProvider, type ClientPermissionMap } from "./PermissionContext";
import { AccountMenu } from "./AccountMenu";
import { NavMore } from "./NavMore";
import { active, activeAmong, barLabel, bottomSlots } from "@/lib/bottom-nav";

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
type NavGroup =
  "Overview" | "Reports" | "Performance" | "Incentives" | "Stock & Cash" | "Data Operations" | "Management";
/**
 * `group` is optional because the field roles (manager, supervisor, accounts,
 * rso, bp) render a FLAT list and have no groups. It is required in practice for
 * the admin/IT menu, and `tests/nav.smoke.test.ts` asserts that — an ungrouped
 * item there would simply not be drawn, which is the failure this whole change
 * is about.
 */
/**
 * `live` marks the one entry that shows a pulsing dot — Live GA. It is a flag
 * rather than a special case in the renderer so the indicator belongs to the
 * item, and so there can only ever be one kind of it.
 */
/**
 * `short` is the name the BOTTOM BAR uses when the real one will not fit a
 * 64px cell. The sidebar, the More sheet and the page heading all keep the
 * full label — a menu that renames a destination depending on where you read
 * it is the "two words for one thing" problem this project keeps finding, so
 * the short form is an abbreviation of the same name, never a different one.
 */
type NavItem = {
  href: string;
  label: string;
  short?: string;
  icon: string;
  module?: string;
  group?: NavGroup;
  live?: boolean;
  /**
   * Shown only to the roles that may CREATE and EDIT in this module.
   *
   * A permission module answers "may this role see the area", which is the
   * right question for a destination. It is the wrong question for a setup
   * screen inside an area everybody can read: every RSO may view Sim Support,
   * and none of them may pick support codes. The page enforces it either way —
   * this keeps a door out of the menu that opens onto a redirect.
   */
  writersOnly?: boolean;
  /**
   * The house's own books — what we paid the company, and what we spend.
   *
   * A separate flag from `writersOnly` because it answers a different
   * question. `writersOnly` means "may this role EDIT the area"; this means
   * "may this role see the BUYING side at all", and the owner's answer is
   * Accounts, IT and Admin only — a manager writes campaigns and reads every
   * due, and still does not see a purchase price.
   */
  booksOnly?: boolean;
};
type RoleConfig = { name: string; title: string; initials: string; home: string; nav: NavItem[]; bottom: NavItem[] };
const adminNav: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "home", module: "dashboard", group: "Overview" },
  { href: "/live-ga", label: "Live GA", icon: "sim", module: "dashboard", group: "Overview", live: true },
  // v205: who sold the most, for motivation.
  {
    href: "/leaderboard",
    label: "Leaderboard",
    short: "Leaders",
    icon: "target",
    module: "performance",
    group: "Performance",
  },
  // Reports were IT-only in the demos, but the routes have always allowed
  // ADMIN too, and an admin who cannot reach the Reporting Center from the
  // menu has to know the URL. Both roles get the group.
  {
    href: "/it/reports",
    label: "Reporting Center",
    short: "Reports",
    icon: "file",
    module: "dashboard",
    group: "Reports",
  },
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
    short: "RSOs",
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
  { href: "/campaigns", label: "Campaigns", icon: "target", module: "campaigns", group: "Incentives" },
  { href: "/support", label: "Sim Support", short: "Support", icon: "wallet", module: "support", group: "Incentives" },
  /*
   * Its own entry, not just a button on the Sim Support page.
   *
   * Picking an RSO's slab codes is a setup job somebody does on its own, not
   * something reached on the way to reading a day's money — and an RSO with no
   * code earns no slab at all, so the office needs a standing way in. It is
   * listed only for the roles that may edit: `allowed()` checks the module, and
   * "support" alone would put it in front of every RSO.
   */
  {
    href: "/support/codes",
    label: "Support Codes",
    short: "Codes",
    icon: "shop",
    module: "support",
    group: "Incentives",
    writersOnly: true,
  },
  /*
   * v192. Stock and cash is its own group, not a line under Data Operations:
   * everything in that group is a vendor file arriving from the company, and
   * this is the distribution house's own money. One entry reaches the rest.
   */
  { href: "/stock", label: "Stock & Cash", short: "Stock", icon: "wallet", module: "stock", group: "Stock & Cash" },
  // v205: who owes, and a WhatsApp reminder one tap away.
  {
    href: "/stock/reminders",
    label: "Due Reminders",
    short: "Dues",
    icon: "alert",
    module: "stock",
    group: "Stock & Cash",
  },
  // v206: goods out against money in, by day and by person.
  {
    href: "/stock/collections",
    label: "Collections",
    short: "Collect",
    icon: "chart",
    module: "stock",
    group: "Stock & Cash",
  },
  // v206: the cash box and the closed months — the house's own books, so booksOnly.
  {
    href: "/stock/cash-book",
    label: "Cash Book",
    short: "Cash",
    icon: "wallet",
    module: "stock",
    group: "Stock & Cash",
    booksOnly: true,
  },
  {
    href: "/stock/month-close",
    label: "Month Close",
    short: "Close",
    icon: "shield",
    module: "stock",
    group: "Stock & Cash",
    booksOnly: true,
  },
  /*
   * v195. The evening report. First in the group after the landing page,
   * because it is the one screen Accounts opens every single day.
   */
  {
    href: "/stock/day-report",
    label: "Daily Report",
    short: "Report",
    icon: "file",
    module: "stock",
    group: "Stock & Cash",
    booksOnly: true,
  },
  /*
   * v194. The house's own books. `booksOnly` keeps them out of a manager's
   * menu: every role may VIEW the stock module, and the buying price is a
   * narrower question than that — the same shape as `writersOnly` in v190.
   */
  { href: "/stock/lifting", label: "Lifting", icon: "upload", module: "stock", group: "Stock & Cash", booksOnly: true },
  {
    href: "/stock/expenses",
    label: "Expenses",
    icon: "balance",
    module: "stock",
    group: "Stock & Cash",
    booksOnly: true,
  },
  {
    href: "/stock/profit",
    label: "Profit & Loss",
    short: "Profit",
    icon: "chart",
    module: "stock",
    group: "Stock & Cash",
    booksOnly: true,
  },
  { href: "/stock/sim-check", label: "SIM Check", short: "SIM", icon: "sim", module: "stock", group: "Stock & Cash" },
  {
    href: "/admin/upload",
    label: "Upload Center",
    short: "Upload",
    icon: "upload",
    module: "ga",
    group: "Data Operations",
  },
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
  /*
   * v189. Campaigns and Sim Support are neither reports nor uploads: they are
   * things the office SETS and the field chases. Folding them into Performance
   * would put an editable target beside a read-only figure under one heading.
   */
  { label: "Incentives", icon: "target" },
  { label: "Stock & Cash", icon: "wallet" },
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
      { href: "/live-ga", label: "Live GA", icon: "sim", module: "dashboard", live: true },
      { href: "/manager/attention", label: "Attention", icon: "target", module: "attention" },
      { href: "/manager/supervisors", label: "Supervisors", icon: "users", module: "employees" },
      { href: "/manager/rsos", label: "RSOs", icon: "chart", module: "performance" },
      // The manager has held `retailers: view` since the permissions were
      // written; the entry was simply never added, so the module was
      // unreachable except by typing the URL.
      { href: "/manager/retailers", label: "Retailers", icon: "shop", module: "retailers" },
      { href: "/manager/bp-activations", label: "BP Activations", short: "BP Activ.", icon: "sim", module: "bp" },
      { href: "/campaigns", label: "Campaigns", icon: "target", module: "campaigns" },
      { href: "/leaderboard", label: "Leaderboard", short: "Leaders", icon: "target", module: "dashboard" },
      { href: "/support", label: "Sim Support", short: "Support", icon: "wallet", module: "support" },
      { href: "/stock", label: "Stock & Cash", short: "Stock", icon: "balance", module: "stock" },
      { href: "/stock/reminders", label: "Due Reminders", short: "Dues", icon: "alert", module: "stock" },
      { href: "/stock/collections", label: "Collections", short: "Collect", icon: "chart", module: "stock" },
      { href: "/stock/sim-check", label: "SIM Check", short: "SIM", icon: "sim", module: "stock" },
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
      { href: "/live-ga", label: "Live GA", icon: "sim", module: "dashboard", live: true },
      { href: "/supervisor/attention", label: "Attention", icon: "target", module: "attention" },
      { href: "/supervisor/rsos", label: "My RSOs", icon: "users", module: "employees" },
      { href: "/supervisor/retailers", label: "Retailers", icon: "shop", module: "retailers" },
      { href: "/supervisor/bp-activations", label: "BP Activations", short: "BP Activ.", icon: "sim", module: "bp" },
      { href: "/campaigns", label: "Campaigns", icon: "target", module: "campaigns" },
      { href: "/leaderboard", label: "Leaderboard", short: "Leaders", icon: "target", module: "dashboard" },
      { href: "/support", label: "Sim Support", short: "Support", icon: "wallet", module: "support" },
      { href: "/stock", label: "Stock & Cash", short: "Stock", icon: "balance", module: "stock" },
      { href: "/stock/reminders", label: "Due Reminders", short: "Dues", icon: "alert", module: "stock" },
      { href: "/stock/collections", label: "Collections", short: "Collect", icon: "chart", module: "stock" },
      { href: "/stock/sim-check", label: "SIM Check", short: "SIM", icon: "sim", module: "stock" },
    ],
    bottom: [],
  },
  accounts: {
    name: "Accounts",
    title: "Stock & money",
    initials: "AC",
    home: "/accounts",
    nav: [
      /*
       * v197, the owner's ruling on what Accounts is for: *"Accounts ar kaj
       * holo stock updated kora.. sob thik moto hoce naki check kora and taka
       * management thik moto rakha"*. Files are uploaded by IT; targets and
       * campaigns belong to other roles. So Operations, Opportunity, SC &
       * Targets and Campaigns are gone from this menu — and from the APIs
       * behind them, because a hidden menu over an open endpoint is a claim
       * the app does not enforce.
       *
       * The first four are the phone's bottom bar (lib/bottom-nav.ts).
       */
      { href: "/accounts", label: "Overview", icon: "home", module: "dashboard" },
      // The screen the owner called "oita onk important": giving RSOs their products.
      { href: "/stock/daily", label: "Daily Entry", short: "Entry", icon: "upload", module: "stock" },
      { href: "/stock", label: "Stock & Cash", short: "Stock", icon: "balance", module: "stock" },
      { href: "/stock/day-report", label: "Daily Report", short: "Report", icon: "file", module: "stock" },
      { href: "/stock/reminders", label: "Due Reminders", short: "Dues", icon: "alert", module: "stock" },
      // v206: the cash box, counted and closed each evening; and the month's collections.
      { href: "/stock/cash-book", label: "Cash Book", short: "Cash", icon: "wallet", module: "stock" },
      { href: "/stock/collections", label: "Collections", short: "Collect", icon: "chart", module: "stock" },
      { href: "/stock/lifting", label: "Lifting", icon: "upload", module: "stock" },
      { href: "/stock/expenses", label: "Expenses", icon: "balance", module: "stock" },
      { href: "/stock/profit", label: "Profit & Loss", short: "Profit", icon: "chart", module: "stock" },
      { href: "/stock/sim-check", label: "SIM Check", short: "SIM", icon: "sim", module: "stock" },
      { href: "/stock/products", label: "Products", icon: "shop", module: "stock" },
      { href: "/stock/opening", label: "Opening Balance", short: "Opening", icon: "balance", module: "stock" },
      { href: "/stock/month-close", label: "Month Close", short: "Close", icon: "shield", module: "stock" },
      { href: "/accounts/people", label: "RSO & BP", icon: "users", module: "employees" },
      { href: "/accounts/retailers", label: "Retailer Search", short: "Search", icon: "search", module: "retailers" },
      { href: "/support", label: "Sim Support", short: "Support", icon: "wallet", module: "support" },
      { href: "/live-ga", label: "Live GA", icon: "sim", module: "dashboard", live: true },
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
      { href: "/live-ga", label: "Live GA", icon: "sim", module: "dashboard", live: true },
      // SSO and LSO are the RSO's daily worklists in the approved demo, so they sit
      // above the general Attention page rather than buried under it.
      { href: "/rso/sso", label: "SSO", icon: "phone", module: "attention" },
      { href: "/rso/lso", label: "LSO", icon: "chart", module: "attention" },
      { href: "/rso/attention", label: "Attention", icon: "target", module: "attention" },
      { href: "/rso/retailers", label: "Retailers", icon: "shop", module: "retailers" },
      /*
       * ONE BP entry, not two.
       *
       * The RSO had "My BP" and "BP Activations" side by side, and both opened
       * a list of the same Business Partners — one with each BP's monthly GA,
       * the other with each BP's assignment row. Two menu items for one
       * question ("how are my BPs doing?") is a choice the reader should not
       * have to make, and on a phone it cost a whole nav column.
       *
       * My BP is the list; tapping a BP opens that BP's own record, which is
       * where the day-by-day activations live. /rso/bp/activations is gone.
       */
      { href: "/rso/bp", label: "My BP", icon: "users", module: "bp" },
      /*
       * The field's two new destinations, at the END of the list on purpose:
       * the bar shows the first four and these fall into the More sheet, which
       * is where a target you check once a day belongs. The worklists above are
       * what an RSO opens twenty times.
       */
      { href: "/campaigns", label: "Campaigns", icon: "target", module: "campaigns" },
      { href: "/leaderboard", label: "Leaderboard", short: "Leaders", icon: "target", module: "dashboard" },
      { href: "/support", label: "Sim Support", short: "Support", icon: "wallet", module: "support" },
      { href: "/stock", label: "Stock & Cash", short: "Stock", icon: "balance", module: "stock" },
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
      { href: "/live-ga", label: "Live GA", icon: "sim", module: "dashboard", live: true },
      { href: "/bp/sales", label: "Sales", icon: "sim", module: "ga" },
      { href: "/campaigns", label: "Campaigns", icon: "target", module: "campaigns" },
      { href: "/leaderboard", label: "Leaderboard", short: "Leaders", icon: "target", module: "dashboard" },
      { href: "/support", label: "Sim Support", short: "Support", icon: "wallet", module: "support" },
      { href: "/stock", label: "Stock & Cash", short: "Stock", icon: "balance", module: "stock" },
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
/*
 * The field roles put their WHOLE nav in the bottom bar, and they have to.
 *
 * Below 900px the sidebar is `display: none`, so the bottom bar is the only
 * navigation that exists on a phone. Anything left out of it is unreachable
 * unless you know the URL — which is why capping the bar is not the tidy fix it
 * looks like. The RSO's seven entries are seven real destinations.
 *
 * This block used to say both things at once:
 *
 *     for (const key of [...]) configs[key].bottom = configs[key].nav.slice(0, 4);
 *     configs.rso.bottom = configs.rso.nav;   // ...and three more like it
 *
 * The loop capped at four and the next four lines threw that away, so the cap
 * applied to nobody: `bp` was the only role left holding it and it has two
 * entries. Code that states a rule it does not apply is worse than no rule —
 * the grid was still sized for at most six columns, so the RSO's seventh item
 * wrapped onto a second row and ate the bottom of a 390px screen.
 */
/*
 * v203: the notice board, for every role — posters manage it there, everyone
 * else reads it there (and sees what is new on their home screen). No module:
 * a notice addressed to you is never behind a permission.
 */
const NOTICES: NavItem = { href: "/notices", label: "Notice Board", short: "Notices", icon: "info", group: "Overview" };
for (const key of Object.keys(configs))
  if (!configs[key].nav.some((i) => i.href === NOTICES.href)) configs[key].nav.push(NOTICES);
for (const key of ["manager", "supervisor", "accounts", "rso", "bp"]) configs[key].bottom = configs[key].nav;
function roleFor(path: string) {
  const first = path.split("/").filter(Boolean)[0] || "";
  return configs[first] || configs.admin;
}
/** The three roles that may create and edit campaigns and support offers. */
const WRITER_ROLES = ["ADMIN", "IT", "MANAGER"];

/** The three roles the owner allows to see what we paid the company (v194). */
const BOOKS_ROLES = ["ACCOUNTS", "ADMIN", "IT"];

function allowed(item: NavItem, permissions: ClientPermissionMap, admin: boolean, role = "") {
  // `writersOnly` is checked BEFORE the admin shortcut's twin below, because a
  // Manager is not `admin` here and must still see it.
  if (item.writersOnly && !WRITER_ROLES.includes(role.toUpperCase())) return false;
  /*
   * And `booksOnly` before it too, but for the opposite reason: a Manager IS
   * allowed by the admin shortcut in some configurations, and must still not
   * see a purchase price.
   */
  if (item.booksOnly && !BOOKS_ROLES.includes(role.toUpperCase())) return false;
  if (admin) return true;
  return !item.module || Boolean(permissions[item.module]?.view);
}
export default function AppShell({
  children,
  user,
  permissions,
  notices = [],
}: {
  children: React.ReactNode;
  user: { displayName: string; role: string } | null;
  permissions: ClientPermissionMap;
  /** v203: today's notices for this person, shown on their home screen. */
  notices?: NoticeView[];
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
    return (
      <PermissionProvider permissions={permissions}>
        <FeedbackProvider>{children}</FeedbackProvider>
      </PermissionProvider>
    );
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
  const visibleNav = role.nav.filter((i) => allowed(i, permissions, isAdmin, roleName));
  const visibleBottom = role.bottom.filter((i) => allowed(i, permissions, isAdmin, roleName));
  const searchPages = visibleNav.map((i) => ({ href: i.href, label: i.label, group: i.group }));
  /*
   * Five cells at most. `lib/bottom-nav.ts` carries the measurement that
   * settled the number and the rule for what happens to the rest.
   */
  const isActive = activeAmong(visibleNav.map((i) => i.href));
  const bar = bottomSlots(visibleBottom, path, isActive);
  return (
    <PermissionProvider permissions={permissions}>
      <FeedbackProvider>
        <div className={`app-root ${isAdmin ? "admin-app" : `${roleKey}-app`}`}>
          <aside ref={sidebarRef} className={`desktop-sidebar ${navPending ? "nav-is-pending" : ""}`}>
            <div className="sidebar-brand">
              <Brand href={role.home} />
            </div>
            {/* v203: one box for any person, outlet or page — Ctrl K from anywhere. */}
            {user ? <QuickSearch variant="sidebar" pages={searchPages} /> : null}
            <div className="sidebar-section">{role.title}</div>
            {isAdmin ? (
              <AdminNav
                nav={role.nav}
                path={path}
                permissions={permissions}
                onNavigate={setNavPending}
                role={roleName}
                isActive={isActive}
              />
            ) : (
              visibleNav.map((i) => (
                <NavLink key={i.href} item={i} path={path} onNavigate={setNavPending} isActive={isActive} />
              ))
            )}
            <div className="sidebar-spacer" />
            {/* Sign out used to be a button of its own here and nowhere else —
              so below 900px, where this sidebar is display:none, there was no
              way to sign out at all and no way to change a PIN on any width.
              Both now live behind the profile block, which is the thing people
              already reach for, and the same sheet opens from the phone's
              avatar. */}
            <AccountMenu
              variant="profile"
              name={profileName}
              roleTitle={role.title}
              role={user?.role || ""}
              initials={role.initials}
            />
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
              <div className="mobile-top-acts">
                {user ? <QuickSearch variant="icon" pages={searchPages} /> : null}
                <AccountMenu
                  variant="avatar"
                  name={profileName}
                  roleTitle={role.title}
                  role={user?.role || ""}
                  initials={role.initials}
                />
              </div>
            </header>
            {path === role.home && notices.length ? (
              <div className="notice-home">
                <NoticeStrip notices={notices} />
              </div>
            ) : null}
            {children}
            {visibleBottom.length > 0 && (
              /*
               * INSIDE `.app-main`, and that placement is load-bearing.
               *
               * It used to be a sibling of `.app-main`, directly under
               * `.app-root` — which is `display: flex` in the ROW direction. So
               * the nav was a second flex item on that row: it claimed the full
               * 390px, and `.app-main` (flex: 1, min-width: 0) was squeezed to
               * ZERO width. Every page rendered as a blank white column with the
               * nav's icons stranded at the top and the active item's highlight
               * stretched down the whole document, because a row flex item
               * stretches to the line's height.
               *
               * Desktop never showed it: at >=900px the nav is `display: none`,
               * so it stops being a flex item and `.app-main` gets the row back.
               * The app was unusable on a phone and perfect on the machine it
               * was being checked on.
               *
               * Here it is the last child of the column that holds the page, so
               * `position: sticky; bottom: 0` pins it to the bottom of the
               * viewport the way it was always meant to.
               *
               * The count is whatever the signed-in role can see; the classes for
               * 2..6 are in kit.css, and anything outside that keeps the
               * stylesheet's own default rather than falling back to an inline
               * style.
               */
              <nav className={`bottom-nav is-cols-${bar.shown.length + (bar.hasMore ? 1 : 0)}`}>
                {bar.shown.map((i) => (
                  <Link
                    key={i.href}
                    href={i.href}
                    prefetch={true}
                    onPointerEnter={() => router.prefetch(i.href)}
                    onClick={() => setNavPending(i.href)}
                    className={`bottom-link ${isActive(path, i.href) ? "active" : ""}${i.live ? " is-live" : ""}`}
                  >
                    <Icon name={i.icon} />
                    {/*
                    The bottom bar needs the dot more than the sidebar does.
                    Below 900px the sidebar is `display: none`, so on the phones
                    that nine in ten of this app's users hold, this bar IS the
                    navigation — an indicator that lived only in the sidebar
                    would be invisible to exactly the people it is for.
                  */}
                    {i.live ? <span className="nav-live-dot is-corner" aria-hidden="true" /> : null}
                    <span>{barLabel(i)}</span>
                  </Link>
                ))}
                {bar.hasMore && (
                  <NavMore
                    items={visibleBottom}
                    path={path}
                    isActive={isActive}
                    onNavigate={setNavPending}
                    /*
                     * `bar.overflow`, not "is the current page missing from the
                     * bar": the swap above means the page you are on is almost
                     * never in the overflow, so this lights up only in the case
                     * it is meant for — a route with no bar entry of its own,
                     * such as a detail page opened from a list.
                     */
                    highlight={!bar.shown.some((i) => isActive(path, i.href))}
                  />
                )}
              </nav>
            )}
          </div>
        </div>
      </FeedbackProvider>
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
  role,
  isActive,
}: {
  nav: NavItem[];
  path: string;
  permissions: ClientPermissionMap;
  onNavigate: (href: string) => void;
  /** The signed-in role, for the entries that only writers may see. */
  role: string;
  /** The shell's one answer to "which item is current" — see `activeAmong`. */
  isActive: (path: string, href: string) => boolean;
}) {
  const groups = NAV_GROUPS.map((g) => ({ ...g, items: nav.filter((i) => i.group === g.label) }));
  return (
    <nav className="admin-sidebar-nav">
      {groups.map((g) => {
        const items = g.items.filter((i) => allowed(i, permissions, true, role));
        if (!items.length) return null;
        const groupActive = items.some((i) => isActive(path, i.href));
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
              {/*
                An icon, not the character "⌄". The glyph was drawn by whatever
                font the device had, so it sat on the text baseline rather than
                the row's optical centre, its stroke did not match the nav
                icons beside it, and on the owner's screenshots it read as a
                bare "^" and "v". This is the same 24px grid and the same
                1.8px stroke as every other icon in the menu.
              */}
              <Icon name="chevron" className="nav-icon nav-chevron" />
            </summary>
            <div className="admin-nav-items">
              {items.map((i) => (
                <NavLink key={i.href} item={i} path={path} onNavigate={onNavigate} isActive={isActive} />
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
function NavLink({
  item,
  path,
  onNavigate,
  isActive: activeFn,
}: {
  item: NavItem;
  path: string;
  onNavigate: (href: string) => void;
  isActive: (path: string, href: string) => boolean;
}) {
  const router = useRouter();
  const isActive = activeFn(path, item.href);
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
      className={`sidebar-link ${isActive ? "active" : ""}${item.live ? " is-live" : ""}`}
    >
      <Icon name={item.icon} />
      <span className="sidebar-link-label">{item.label}</span>
      {/*
        The pulsing dot the owner asked for. `aria-hidden` because it carries no
        information a screen reader needs — the label already says Live GA — and
        an unlabelled animated dot announced on every focus would be noise.
      */}
      {item.live ? <span className="nav-live-dot" aria-hidden="true" /> : null}
    </Link>
  );
}
