import { requireUser } from "../../lib/auth";

/**
 * Defence in depth for the reporting tree.
 *
 * Every page under /it/reports already calls `requireUser(["ADMIN", "IT"])`
 * itself, and each one was verified to do so. This layout exists so that the
 * next page added here is guarded whether or not its author remembers: every
 * other role tree (/rso, /supervisor, /manager, /accounts, /bp, /admin) gets
 * its guard from a layout, and /it was the one tree relying on 12 individual
 * calls staying correct.
 *
 * The per-page calls are deliberately kept. They cost nothing, they document
 * each page's own requirement, and `tests/route-guards.smoke.test.ts` reads
 * either source.
 */
export default async function ItLayout({ children }: { children: React.ReactNode }) {
  await requireUser(["ADMIN", "IT"]);
  return <>{children}</>;
}
