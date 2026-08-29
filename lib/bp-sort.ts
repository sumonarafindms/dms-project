/**
 * Orders for a BP assignment list. Shared by the admin BP Performance page and
 * the manager / supervisor / RSO BP Activation lists, so the same dropdown
 * means the same thing everywhere.
 */

import type { BpAssignmentListRow } from "./bp-activations";
import { byNumberAsc, byNumberDesc, byText, type SortSpec } from "./sort";

const label = (b: BpAssignmentListRow) => b.retailer.retailerName || b.retailer.retailerCode;
const pctOf = (b: BpAssignmentListRow) => (b.gaTarget > 0 ? Math.round((b.monthGa / b.gaTarget) * 100) : 0);

export const BP_SORTS: SortSpec<BpAssignmentListRow>[] = [
  {
    value: "active-first",
    label: "Active first, then newest",
    compare: (a, b) => Number(b.active) - Number(a.active) || b.startDate.getTime() - a.startDate.getTime(),
  },
  { value: "ga-desc", label: "SIM sales — high to low", compare: byNumberDesc((b) => b.monthGa, label) },
  { value: "ga-asc", label: "SIM sales — low to high", compare: byNumberAsc((b) => b.monthGa, label) },
  { value: "pct-desc", label: "GA target % — high to low", compare: byNumberDesc(pctOf, label) },
  { value: "pct-asc", label: "GA target % — low to high", compare: byNumberAsc(pctOf, label) },
  { value: "target-desc", label: "GA target — high to low", compare: byNumberDesc((b) => b.gaTarget, label) },
  { value: "name-asc", label: "BP name — A to Z", compare: (a, b) => byText(label(a), label(b)) },
  {
    value: "code-asc",
    label: "BP code — A to Z",
    compare: (a, b) => byText(a.retailer.retailerCode, b.retailer.retailerCode),
  },
  {
    value: "rso-asc",
    label: "RSO — A to Z",
    compare: (a, b) => byText(a.employee.name, b.employee.name) || byText(label(a), label(b)),
  },
  {
    value: "start-desc",
    label: "Assigned — newest first",
    compare: (a, b) => b.startDate.getTime() - a.startDate.getTime(),
  },
  {
    value: "start-asc",
    label: "Assigned — oldest first",
    compare: (a, b) => a.startDate.getTime() - b.startDate.getTime(),
  },
];
