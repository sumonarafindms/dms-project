"use client";

/**
 * The level switch on a campaign, and the only client code the campaign
 * screens need.
 *
 * It is the same control the four import screens got in v184 —
 * `OpsLevelTabs` — reused rather than reinvented, so "group this by" looks and
 * behaves the same wherever it appears. The levels here are supervisor and
 * RSO; there is no retailer level, because a campaign target is set per person
 * and never per outlet.
 */

import { useState } from "react";
import { OpsLevelTabs, OpsTable } from "./OperationsPremiumUI";
import { Card, EmptyState } from "./Kit";
import { CampaignEmployeeRows, CampaignSupervisorRows } from "./CampaignViews";
import type { CampaignEmployeeRow, CampaignSupervisorRow } from "../../lib/campaign-data";
import type { OpsLevel } from "../../lib/ops-rollup";

export function CampaignLevels({
  supervisors,
  employees,
  showSupervisors,
}: {
  supervisors: CampaignSupervisorRow[];
  employees: CampaignEmployeeRow[];
  showSupervisors: boolean;
}) {
  const levels: OpsLevel[] = showSupervisors ? ["supervisor", "rso"] : ["rso"];
  const [level, setLevel] = useState<OpsLevel>(levels[0]);
  const rows = level === "supervisor" ? supervisors : employees;
  return (
    <Card className="kit-report-table cmp-levels">
      {levels.length > 1 ? (
        <OpsLevelTabs
          value={level}
          onChange={setLevel}
          levels={levels}
          counts={{ supervisor: supervisors.length, rso: employees.length }}
        />
      ) : null}
      {/*
        The empty state is OUTSIDE the table, because a card cannot live inside
        one — and "nobody has a target here" is a sentence, not a row.
      */}
      {rows.length === 0 ? (
        <EmptyState
          title={level === "supervisor" ? "No teams to show" : "Nobody to show"}
          hint="Nobody in scope carries a target for this campaign."
        />
      ) : (
        <OpsTable wide>
          {level === "supervisor" ? <CampaignSupervisorRows rows={supervisors} /> : null}
          {level === "rso" ? <CampaignEmployeeRows rows={employees} /> : null}
        </OpsTable>
      )}
    </Card>
  );
}
