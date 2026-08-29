/**
 * Orders for any list of RSOs.
 *
 * Six pages show the same `EmployeePerformance` rows — admin and manager RSO
 * Performance, the supervisor's own team, and the RSO list inside an admin or
 * manager supervisor page — so the dropdown is defined once and means the same
 * thing on all of them. The first entry is the default, and is the fixed order
 * those pages used before the control existed.
 */

import type { EmployeePerformance } from "./performance";
// `targetPercent` rather than performance.ts's identical `pct`: this module is
// imported for its labels alone in places, and achievement.ts is deliberately
// free of @prisma/client so nothing here drags the Prisma runtime along.
import { targetPercent as pct } from "./achievement";
import { byNumberAsc, byNumberDesc, byText, type SortSpec } from "./sort";

const who = (r: EmployeePerformance) => r.name;

export const RSO_SORTS: SortSpec<EmployeePerformance>[] = [
  {
    value: "recharge-desc",
    label: "Recharge % — high to low",
    compare: byNumberDesc((r) => pct(r.totalRechargeAchieved, r.totalRechargeTarget), who),
  },
  {
    value: "recharge-asc",
    label: "Recharge % — low to high",
    compare: byNumberAsc((r) => pct(r.totalRechargeAchieved, r.totalRechargeTarget), who),
  },
  { value: "ga-desc", label: "GA % — high to low", compare: byNumberDesc((r) => pct(r.gaAchieved, r.gaTarget), who) },
  { value: "ga-asc", label: "GA % — low to high", compare: byNumberAsc((r) => pct(r.gaAchieved, r.gaTarget), who) },
  { value: "sso-asc", label: "SSO % — low to high", compare: byNumberAsc((r) => pct(r.ssoAchieved, r.ssoTarget), who) },
  { value: "lso-asc", label: "LSO % — low to high", compare: byNumberAsc((r) => pct(r.lsoAchieved, r.lsoTarget), who) },
  { value: "name-asc", label: "Name — A to Z", compare: (a, b) => byText(a.name, b.name) },
  {
    value: "supervisor-asc",
    label: "Supervisor — A to Z",
    compare: (a, b) => byText(a.supervisor, b.supervisor) || byText(a.name, b.name),
  },
  {
    value: "retailers-desc",
    label: "Retailers — most first",
    compare: byNumberDesc((r) => r.retailerCount, who),
  },
];
