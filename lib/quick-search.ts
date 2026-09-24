/**
 * v203 — Quick search: one box that finds a person, an outlet or a page.
 *
 * The owner chose it from the "user friendly" list, and it answers the
 * complaint this project keeps hearing in different words — "scroll kore
 * khujte hoi": you know WHO, you should not have to know WHERE.
 *
 * ## Scope is the page's scope
 *
 * Every result links to a page that role can open, and only for people that
 * page would show them. A manager finds their own supervisors' RSOs, not
 * another manager's; a supervisor their team; an RSO their own outlets and
 * BPs; a BP only pages. A result the page would refuse is a result not given.
 *
 * ## Matching
 *
 * A name, a code or a phone number. A number of seven digits or more is read
 * as a phone however it is typed (+880, 880, 0 or none — see lib/text-search)
 * and matched on its national digits; anything else is a case-insensitive
 * "contains" on names and codes.
 */

import { prisma } from "./prisma";
import { managerScope } from "./manager-scope";
import { bpDisplayName } from "./bp-name";
import { phoneKey } from "./phone";
import { foldDigits } from "./format";

import type { QuickHit } from "./quick-search-types";
export type { QuickHit };

type Viewer = {
  id: string;
  role: string;
  employeeId?: string | null;
  supervisorId?: string | null;
};

const PER_GROUP = 6;

/** Where each kind of result opens, per role. Null: that role has no page for it. */
const LINKS: Record<string, Partial<Record<QuickHit["kind"], (id: string, type?: string) => string>>> = {
  ADMIN: {
    RSO: (id) => `/admin/rsos/${id}`,
    Supervisor: (id) => `/admin/performance/supervisors/${id}`,
    BP: (id) => `/admin/performance/bps/${id}`,
    Outlet: (id) => `/admin/retailers/${id}`,
  },
  IT: {
    RSO: (id) => `/admin/rsos/${id}`,
    Supervisor: (id) => `/admin/performance/supervisors/${id}`,
    BP: (id) => `/admin/performance/bps/${id}`,
    Outlet: (id) => `/admin/retailers/${id}`,
  },
  ACCOUNTS: {
    // Accounts lives in the ledger: a person opens on what they hold and owe.
    RSO: (id) => `/stock/RSO/${id}`,
    Supervisor: (id) => `/stock/SUPERVISOR/${id}`,
    BP: (id, retailerId) => `/stock/BP/${retailerId}`,
    Outlet: (id) => `/accounts/retailers/${id}`,
  },
  MANAGER: {
    RSO: (id) => `/manager/rsos/${id}`,
    Supervisor: (id) => `/manager/supervisors/${id}`,
    BP: (id) => `/manager/bp-activations/${id}`,
    Outlet: (id) => `/manager/retailers/${id}`,
  },
  SUPERVISOR: {
    RSO: (id) => `/supervisor/rsos/${id}`,
    BP: (id) => `/supervisor/bp-activations/${id}`,
    Outlet: (id) => `/supervisor/retailers/${id}`,
  },
  RSO: {
    BP: (id) => `/rso/bp/${id}`,
    Outlet: (id) => `/rso/retailers/${id}`,
  },
};

/** The people this viewer may be shown. null = everyone. */
async function scopeOf(v: Viewer): Promise<{ supervisorIds: string[] | null; employeeIds: string[] | null } | null> {
  if (["ADMIN", "IT", "ACCOUNTS"].includes(v.role)) return { supervisorIds: null, employeeIds: null };
  if (v.role === "MANAGER") return managerScope(v.id);
  if (v.role === "SUPERVISOR") {
    if (!v.supervisorId) return null;
    const rsos = await prisma.employee.findMany({
      where: { supervisorId: v.supervisorId, active: true },
      select: { id: true },
    });
    return { supervisorIds: [v.supervisorId], employeeIds: rsos.map((r) => r.id) };
  }
  if (v.role === "RSO") return v.employeeId ? { supervisorIds: [], employeeIds: [v.employeeId] } : null;
  return null;
}

export async function quickSearch(viewer: Viewer, rawQuery: string): Promise<QuickHit[]> {
  const q = foldDigits(String(rawQuery ?? ""))
    .trim()
    .slice(0, 60);
  if (q.length < 2) return [];
  const links = LINKS[viewer.role];
  if (!links) return [];
  const scope = await scopeOf(viewer);
  if (!scope) return [];

  const digits = /^\+?\d[\d\s-]{5,}$/.test(q) ? phoneKey(q) : "";
  const phone = digits.length >= 6 ? digits : "";
  const text = { contains: q, mode: "insensitive" as const };
  const inEmp = scope.employeeIds === null ? {} : { id: { in: scope.employeeIds } };
  const inSup = scope.supervisorIds === null ? {} : { id: { in: scope.supervisorIds } };
  const ownedBy = scope.employeeIds === null ? {} : { employeeId: { in: scope.employeeIds } };

  const [rsos, sups, bps, outlets] = await Promise.all([
    links.RSO
      ? prisma.employee.findMany({
          where: {
            active: true,
            ...inEmp,
            OR: phone
              ? [{ rsoMsisdn: { contains: phone } }, { user: { mobileNumber: { contains: phone } } }]
              : [{ name: text }, { employeeCode: text }, { rsoMsisdn: text }],
          },
          select: { id: true, name: true, employeeCode: true, rsoMsisdn: true, supervisor: { select: { name: true } } },
          orderBy: { name: "asc" },
          take: PER_GROUP,
        })
      : [],
    links.Supervisor
      ? prisma.supervisor.findMany({
          where: {
            active: true,
            ...inSup,
            OR: phone ? [{ user: { mobileNumber: { contains: phone } } }] : [{ name: text }],
          },
          select: { id: true, name: true, _count: { select: { employees: true } } },
          orderBy: { name: "asc" },
          take: PER_GROUP,
        })
      : [],
    links.BP
      ? prisma.bpAssignment.findMany({
          where: {
            active: true,
            ...ownedBy,
            retailer: phone
              ? {
                  OR: [
                    { iTopUpNumber: { contains: phone } },
                    { tranMobileNo: { contains: phone } },
                    { bpUser: { mobileNumber: { contains: phone } } },
                  ],
                }
              : { OR: [{ retailerCode: text }, { retailerName: text }, { bpName: text }] },
          },
          select: {
            id: true,
            retailerId: true,
            retailer: { select: { retailerCode: true, retailerName: true, bpName: true } },
            employee: { select: { name: true } },
          },
          take: PER_GROUP,
        })
      : [],
    links.Outlet
      ? prisma.retailer.findMany({
          where: {
            active: true,
            ...ownedBy,
            OR: phone
              ? [{ iTopUpNumber: { contains: phone } }, { tranMobileNo: { contains: phone } }]
              : [{ retailerCode: text }, { retailerName: text }],
          },
          select: { id: true, retailerCode: true, retailerName: true, employee: { select: { name: true } } },
          orderBy: { retailerCode: "asc" },
          take: PER_GROUP,
        })
      : [],
  ]);

  const hits: QuickHit[] = [];
  for (const r of rsos)
    hits.push({
      kind: "RSO",
      title: r.name,
      sub: [r.employeeCode, r.rsoMsisdn, r.supervisor?.name].filter(Boolean).join(" · "),
      href: links.RSO!(r.id),
    });
  for (const s of sups)
    hits.push({
      kind: "Supervisor",
      title: s.name,
      sub: `${s._count.employees} RSOs`,
      href: links.Supervisor!(s.id),
    });
  for (const b of bps)
    hits.push({
      kind: "BP",
      title: bpDisplayName(b.retailer),
      sub: `${b.retailer.retailerCode} · RSO ${b.employee.name}`,
      href: links.BP!(b.id, b.retailerId),
    });
  for (const o of outlets)
    hits.push({
      kind: "Outlet",
      title: o.retailerName || o.retailerCode,
      sub: [o.retailerCode, o.employee?.name ? `RSO ${o.employee.name}` : null].filter(Boolean).join(" · "),
      href: links.Outlet!(o.id),
    });
  return hits;
}
