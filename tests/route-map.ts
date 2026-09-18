/**
 * Which role may load which route — the app's access policy, written down once.
 *
 * ## Why this is a module and not a constant inside one test
 *
 * It started inside `tests/route-guards.smoke.test.ts`, which asserts the map
 * against the source so a new page cannot forget its guard. Then the browser
 * sweep in `e2e/coverage.spec.ts` needed the same list — every route a role can
 * reach, so it can actually load them all.
 *
 * A second copy would have drifted, and drift between two lists that describe
 * the same thing is this project's most reliable source of bugs. One list.
 *
 * Test-only metadata: nothing at runtime reads this. It lives outside `lib/` so
 * it cannot be mistaken for something the app consults.
 */

/**
 * Reachable without a session, deliberately. Adding to this list is a
 * security decision and should be argued for in review, which is the point of
 * making it an explicit constant rather than an absence.
 */
export const PUBLIC = new Set(["/", "/login", "/sacool", "/setup"]);

/** Route -> the roles that may load it. Generated from the source, then frozen. */
export const EXPECTED: Record<string, string[] | "PUBLIC"> = {
  "/": "PUBLIC",
  "/accounts": ["ACCOUNTS"],
  "/accounts/attention": ["ACCOUNTS"],
  "/accounts/operations": ["ACCOUNTS"],
  "/accounts/operations/c2c": ["ACCOUNTS"],
  "/accounts/operations/c2s": ["ACCOUNTS"],
  "/accounts/operations/ga": ["ACCOUNTS"],
  "/accounts/operations/ob": ["ACCOUNTS"],
  "/accounts/operations/targets": ["ACCOUNTS"],
  "/accounts/people": ["ACCOUNTS"],
  "/accounts/retailers": ["ACCOUNTS"],
  "/accounts/retailers/[id]": ["ACCOUNTS"],
  "/admin/attention": ["ADMIN", "IT"],
  "/admin/audit": ["ADMIN", "IT"],
  "/admin/bp-management": ["ADMIN", "IT"],
  "/admin/employees": ["ADMIN", "IT"],
  "/admin/employees/bps": ["ADMIN", "IT"],
  "/admin/employees/bps/[id]": ["ADMIN", "IT"],
  "/admin/employees/bps/new": ["ADMIN", "IT"],
  "/admin/employees/managers": ["ADMIN", "IT"],
  "/admin/employees/managers/[id]": ["ADMIN", "IT"],
  "/admin/employees/managers/new": ["ADMIN", "IT"],
  "/admin/employees/rsos": ["ADMIN", "IT"],
  "/admin/employees/rsos/[id]": ["ADMIN", "IT"],
  "/admin/employees/rsos/new": ["ADMIN", "IT"],
  "/admin/employees/supervisors": ["ADMIN", "IT"],
  "/admin/employees/supervisors/[id]": ["ADMIN", "IT"],
  "/admin/employees/supervisors/new": ["ADMIN", "IT"],
  "/admin/performance": ["ADMIN", "IT"],
  "/admin/performance/bps": ["ADMIN", "IT"],
  "/admin/performance/bps/[id]": ["ADMIN", "IT"],
  "/admin/performance/retailers": ["ADMIN", "IT"],
  "/admin/performance/rsos": ["ADMIN", "IT"],
  "/admin/performance/supervisors": ["ADMIN", "IT"],
  "/admin/performance/supervisors/[id]": ["ADMIN", "IT"],
  "/admin/permissions": ["ADMIN", "IT"],
  "/admin/permissions/[id]": ["ADMIN", "IT"],
  "/admin/retailers": ["ADMIN", "IT"],
  "/admin/retailers/[id]": ["ADMIN", "IT"],
  "/admin/rsos/[id]": ["ADMIN", "IT"],
  "/admin/upload": ["ADMIN", "IT"],
  "/admin/upload/retailers": ["ADMIN", "IT"],
  "/admin/users": ["ADMIN", "IT"],
  "/bp": ["BP"],
  "/bp/sales": ["BP"],
  "/c2c": ["ADMIN", "IT"],
  "/c2s": ["ADMIN", "IT"],
  "/dashboard": ["ADMIN", "IT"],
  "/ga": ["ADMIN", "IT"],
  "/it/readiness": ["ADMIN", "IT"],
  "/it/reports": ["ADMIN", "IT"],
  "/it/reports/activation": ["ADMIN", "IT"],
  "/it/reports/c2c": ["ADMIN", "IT"],
  "/it/reports/c2s": ["ADMIN", "IT"],
  "/it/reports/custom": ["ADMIN", "IT"],
  "/it/reports/daily": ["ADMIN", "IT"],
  "/it/reports/low-c2s": ["ADMIN", "IT"],
  "/it/reports/lso": ["ADMIN", "IT"],
  "/it/reports/ob": ["ADMIN", "IT"],
  "/it/reports/performance/[kind]": ["ADMIN", "IT"],
  "/it/reports/sso": ["ADMIN", "IT"],
  "/it/reports/target": ["ADMIN", "IT"],
  "/live-ga": ["ACCOUNTS", "ADMIN", "BP", "IT", "MANAGER", "RSO", "SUPERVISOR"],
  "/login": "PUBLIC",
  "/manager": ["MANAGER"],
  "/manager/attention": ["MANAGER"],
  "/manager/bp-activations": ["MANAGER"],
  "/manager/bp-activations/[id]": ["MANAGER"],
  "/manager/retailers": ["MANAGER"],
  "/manager/retailers/[id]": ["MANAGER"],
  "/manager/rsos": ["MANAGER"],
  "/manager/rsos/[id]": ["MANAGER"],
  "/manager/supervisors": ["MANAGER"],
  "/manager/supervisors/[id]": ["MANAGER"],
  "/master-data": ["ADMIN", "IT"],
  "/ob": ["ADMIN", "IT"],
  "/rso": ["RSO"],
  "/rso/attention": ["RSO"],
  "/rso/bp": ["RSO"],
  // v145 folded the RSO's two BP menus into one: /rso/bp lists the partners and
  // /rso/bp/[id] is one partner's day-by-day record. /rso/bp/activations and
  // its [id] child are gone — the list duplicated /rso/bp.
  "/rso/bp/[id]": ["RSO"],
  "/rso/lso": ["RSO"],
  "/rso/retailers": ["RSO"],
  "/rso/retailers/[id]": ["RSO"],
  "/rso/sso": ["RSO"],
  "/sacool": "PUBLIC",
  "/setup": "PUBLIC",
  "/supervisor": ["SUPERVISOR"],
  "/supervisor/attention": ["SUPERVISOR"],
  "/supervisor/bp-activations": ["SUPERVISOR"],
  "/supervisor/bp-activations/[id]": ["SUPERVISOR"],
  "/supervisor/retailers": ["SUPERVISOR"],
  "/supervisor/retailers/[id]": ["SUPERVISOR"],
  "/supervisor/rsos": ["SUPERVISOR"],
  "/supervisor/rsos/[id]": ["SUPERVISOR"],
  "/targets": ["ADMIN", "IT"],
  "/ui-preview": ["ADMIN", "IT"],
};
