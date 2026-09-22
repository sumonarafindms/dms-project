/**
 * Who a campaign or a support day is ABOUT, for the person looking at it.
 *
 * Five roles open the same two screens and each should see their own slice:
 *
 *   ADMIN, IT          everybody
 *   MANAGER            the RSOs under the supervisors assigned to them
 *   SUPERVISOR         their own RSOs
 *   RSO                themselves
 *   BP                 the RSO who holds them — a BP's figures live on the
 *                      outlet, and the outlet is reached through its holder
 *
 * Returning `null` for "everybody" rather than a set of every id is
 * deliberate: the query layers take an optional predicate, and a set of two
 * thousand ids would be built, passed and tested for nothing.
 *
 * `managerScope` already answers the manager's question and is reused rather
 * than re-queried, so a manager's campaign screen and their performance screen
 * cannot disagree about which RSOs are theirs.
 */

import { prisma } from "./prisma";
import { managerScope } from "./manager-scope";

export type ViewerScope = {
  /** null: every employee. Otherwise the ids this viewer may see. */
  employeeIds: string[] | null;
  /** The viewer's own employee id, when they are an RSO. */
  selfEmployeeId: string | null;
  /** The retailer this viewer IS, when they are a BP login. */
  selfRetailerId: string | null;
  /** True for the three roles that may create and edit. */
  canWrite: boolean;
};

const WRITERS = ["ADMIN", "IT", "MANAGER"];

export async function viewerScope(user: {
  id: string;
  role: string;
  employeeId?: string | null;
  supervisorId?: string | null;
  bpRetailerId?: string | null;
}): Promise<ViewerScope> {
  const canWrite = WRITERS.includes(user.role);
  const base = { selfEmployeeId: null, selfRetailerId: null, canWrite } as const;

  if (user.role === "ADMIN" || user.role === "IT" || user.role === "ACCOUNTS") return { ...base, employeeIds: null };

  if (user.role === "MANAGER") {
    const scope = await managerScope(user.id);
    /*
     * A manager with no supervisors assigned sees nobody, not everybody. The
     * empty array is the honest answer and the screens say "no team assigned";
     * returning null here would show them the whole distribution.
     */
    return { ...base, employeeIds: scope.employeeIds };
  }

  if (user.role === "SUPERVISOR") {
    const supervisorId = user.supervisorId ?? null;
    if (!supervisorId) return { ...base, employeeIds: [] };
    const rows = await prisma.employee.findMany({
      where: { supervisorId, active: true },
      select: { id: true },
    });
    return { ...base, employeeIds: rows.map((r) => r.id) };
  }

  if (user.role === "RSO") {
    const id = user.employeeId ?? null;
    return { ...base, employeeIds: id ? [id] : [], selfEmployeeId: id };
  }

  if (user.role === "BP") {
    /*
     * A BP is an OUTLET, not an employee, so its figures are reached through
     * the RSO holding it. Several RSOs may hold one outlet (v142), so every
     * holder is in scope — the BP's own numbers are the outlet's either way,
     * and narrowing to one holder would hide the outlet on days another held it.
     */
    const retailerId = user.bpRetailerId ?? null;
    if (!retailerId) return { ...base, employeeIds: [] };
    const holders = await prisma.bpAssignment.findMany({
      where: { retailerId },
      select: { employeeId: true },
    });
    return {
      ...base,
      employeeIds: [...new Set(holders.map((h) => h.employeeId))],
      selfRetailerId: retailerId,
    };
  }

  return { ...base, employeeIds: [] };
}

/** The predicate the query layers take. `null` scope means no filtering. */
export function scopeFilter(scope: ViewerScope): ((employeeId: string) => boolean) | undefined {
  if (scope.employeeIds === null) return undefined;
  const allowed = new Set(scope.employeeIds);
  return (employeeId: string) => allowed.has(employeeId);
}
