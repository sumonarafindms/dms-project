import { prisma } from "./prisma";

export const permissionModules = [
  { key: "dashboard", label: "Dashboard", group: "Overview" },
  { key: "performance", label: "Performance", group: "Overview" },
  { key: "attention", label: "Attention Center", group: "Overview" },
  { key: "employees", label: "Employees", group: "People" },
  { key: "retailers", label: "Retailers", group: "People" },
  { key: "targets", label: "Targets / SC", group: "Operations" },
  { key: "ga", label: "GA", group: "Operations" },
  { key: "c2c", label: "C2C", group: "Operations" },
  { key: "c2s", label: "C2S", group: "Operations" },
  { key: "ob", label: "Opening Balance", group: "Operations" },
  { key: "bp", label: "BP / SIM Sales", group: "Operations" },
  /*
   * v189. Two new areas, and they are separate modules rather than folded into
   * `targets` because the people who may SET them are not the people who may
   * set a monthly target: Accounts owns targets and has no business writing a
   * campaign, while a Manager owns campaigns and cannot upload a target file.
   */
  { key: "campaigns", label: "Campaigns", group: "Operations" },
  { key: "support", label: "Sim Support", group: "Operations" },
  /*
   * v192. Stock and cash accounting is its own module because the people who
   * may WRITE it are nobody else: the owner's ruling is "aita sudu accounts
   * entry korbe". Six roles read it — an RSO and a BP their own, a supervisor
   * and a manager their team's, IT and Admin everything — so "may see the
   * area" and "may enter a day" are genuinely different questions and this
   * module answers only the first. lib/stock-data.ts answers the second.
   */
  { key: "stock", label: "Stock & Cash", group: "Operations" },
] as const;
export type PermissionModule = (typeof permissionModules)[number]["key"];
export type PermissionAction = "view" | "add" | "edit" | "update";

export const roleDefaults: Record<
  string,
  Partial<Record<PermissionModule, { view: boolean; add: boolean; edit: boolean; update: boolean }>>
> = {
  MANAGER: {
    dashboard: { view: true, add: false, edit: false, update: false },
    performance: { view: true, add: false, edit: false, update: false },
    attention: { view: true, add: false, edit: false, update: false },
    employees: { view: true, add: false, edit: false, update: false },
    retailers: { view: true, add: false, edit: false, update: false },
    bp: { view: true, add: false, edit: false, update: false },
    // A manager SETS campaigns and support schemes — the owner's ruling.
    campaigns: { view: true, add: true, edit: true, update: true },
    support: { view: true, add: true, edit: true, update: true },
    // Reads their team's stock and dues; does not enter them.
    stock: { view: true, add: false, edit: false, update: false },
  },
  SUPERVISOR: {
    dashboard: { view: true, add: false, edit: false, update: false },
    performance: { view: true, add: false, edit: false, update: false },
    attention: { view: true, add: false, edit: false, update: false },
    employees: { view: true, add: false, edit: false, update: false },
    retailers: { view: true, add: false, edit: false, update: false },
    bp: { view: true, add: false, edit: false, update: false },
    // Sees what their team needs; does not set it.
    campaigns: { view: true, add: false, edit: false, update: false },
    support: { view: true, add: false, edit: false, update: false },
    stock: { view: true, add: false, edit: false, update: false },
  },
  /*
   * v197: Accounts is stock and money. The owner: "file ja upload korbe IT,
   * Account ar kaj holo stock updated kora... taka management thik moto
   * rakha". So no ga/c2c/c2s/ob uploads, no targets, no attention
   * (Opportunity), no campaigns — and the APIs behind those refuse the role
   * outright, so a custom permission row cannot bring them back.
   */
  ACCOUNTS: {
    dashboard: { view: true, add: false, edit: false, update: false },
    employees: { view: true, add: false, edit: false, update: false },
    retailers: { view: true, add: true, edit: true, update: true },
    // No `bp`: nothing Accounts can open checks it. Its only justification was
    // the Operations workspace, removed above.
    support: { view: true, add: false, edit: false, update: false },
    // The only role that enters stock and cash.
    stock: { view: true, add: true, edit: true, update: true },
  },
  RSO: {
    dashboard: { view: true, add: false, edit: false, update: false },
    attention: { view: true, add: false, edit: false, update: false },
    retailers: { view: true, add: false, edit: false, update: false },
    bp: { view: true, add: false, edit: false, update: false },
    // Their own campaign target and today's support. This is the screen the
    // whole feature is for.
    campaigns: { view: true, add: false, edit: false, update: false },
    support: { view: true, add: false, edit: false, update: false },
    // Their own stock and their own due. The owner: "rso individual dekhbe".
    stock: { view: true, add: false, edit: false, update: false },
  },
  BP: {
    dashboard: { view: true, add: false, edit: false, update: false },
    ga: { view: true, add: false, edit: false, update: false },
    bp: { view: true, add: false, edit: false, update: false },
    campaigns: { view: true, add: false, edit: false, update: false },
    support: { view: true, add: false, edit: false, update: false },
    stock: { view: true, add: false, edit: false, update: false },
  },
};

const none = { view: false, add: false, edit: false, update: false };
const view = { view: true, add: false, edit: false, update: false };
const manage = { view: true, add: true, edit: true, update: true };

export const permissionPresets = {
  ROLE_DEFAULT: "ROLE_DEFAULT",
  VIEW_ONLY: "VIEW_ONLY",
  DATA_OPERATOR: "DATA_OPERATOR",
  FULL_NON_ADMIN: "FULL_NON_ADMIN",
} as const;

export function presetPermissions(role: string, preset: string) {
  if (preset === "ROLE_DEFAULT") {
    return permissionModules.map((m) => ({ module: m.key, ...(roleDefaults[role]?.[m.key] || none) }));
  }
  if (preset === "VIEW_ONLY") {
    return permissionModules.map((m) => ({ module: m.key, ...(roleDefaults[role]?.[m.key]?.view ? view : none) }));
  }
  if (preset === "DATA_OPERATOR") {
    const writable = new Set<PermissionModule>(["retailers", "targets", "ga", "c2c", "c2s", "ob", "bp"]);
    return permissionModules.map((m) => {
      const allowed = Boolean(roleDefaults[role]?.[m.key]?.view);
      return { module: m.key, ...(!allowed ? none : writable.has(m.key) ? manage : view) };
    });
  }
  if (preset === "FULL_NON_ADMIN") {
    return permissionModules.map((m) => ({ module: m.key, ...(roleDefaults[role]?.[m.key]?.view ? manage : none) }));
  }
  return permissionModules.map((m) => ({ module: m.key, ...none }));
}

export async function permissionsFor(userId: string, role: string) {
  if (role === "ADMIN" || role === "IT")
    return Object.fromEntries(
      permissionModules.map((m) => [m.key, { view: true, add: true, edit: true, update: true }]),
    );
  const custom = await prisma.userPermission.findMany({ where: { userId } });
  const result: any = {};
  for (const m of permissionModules) {
    const d = roleDefaults[role]?.[m.key] || { view: false, add: false, edit: false, update: false };
    result[m.key] = { ...d };
  }
  for (const p of custom) result[p.module] = { view: p.canView, add: p.canAdd, edit: p.canEdit, update: p.canUpdate };
  return result;
}
export async function hasPermission(
  userId: string,
  role: string,
  module: PermissionModule,
  action: PermissionAction = "view",
) {
  if (role === "ADMIN" || role === "IT") return true;
  const p = await prisma.userPermission.findUnique({ where: { userId_module: { userId, module } } });
  if (p)
    return action === "view" ? p.canView : action === "add" ? p.canAdd : action === "edit" ? p.canEdit : p.canUpdate;
  const d = roleDefaults[role]?.[module];
  return Boolean(d?.[action]);
}
