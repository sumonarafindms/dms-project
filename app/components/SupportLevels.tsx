"use client";

/**
 * The people table on the support day, with its own switch.
 *
 * Two levels: everyone, and one supervisor's team at a time. There is no
 * retailer level — support is paid to a person, and the outlets it was counted
 * on are already printed in that person's row.
 */

import { useMemo, useState } from "react";
import { Card, EmptyState } from "./Kit";
import { OpsTable } from "./OperationsPremiumUI";
import type { SupportPersonRow } from "../../lib/sim-support-data";

const num = (n: number) => n.toLocaleString("en-US");
const money = (n: number) => `৳${Math.round(n).toLocaleString("en-US")}`;

export function SupportLevels({ people }: { people: SupportPersonRow[] }) {
  const teams = useMemo(() => {
    const seen = new Map<string, string>();
    // Keyed on the supervisor's ID: two supervisors can share a name, and a
    // name-keyed group silently merges their teams — the v181 defect.
    for (const p of people) seen.set(p.supervisorId ?? "unassigned", p.supervisor);
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [people]);
  const [team, setTeam] = useState<string>("all");

  const rows = team === "all" ? people : people.filter((p) => (p.supervisorId ?? "unassigned") === team);

  return (
    <Card className="kit-report-table sup-levels">
      {teams.length > 1 ? (
        <div className="ops-level-tabs" role="tablist" aria-label="Show one team">
          <button
            type="button"
            role="tab"
            aria-selected={team === "all"}
            className={`ops-level-tab${team === "all" ? " is-active" : ""}`}
            onClick={() => setTeam("all")}
          >
            <span>Everyone</span>
            <em>{people.length.toLocaleString("en-US")}</em>
          </button>
          {teams.map(([id, name]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={team === id}
              className={`ops-level-tab${team === id ? " is-active" : ""}`}
              onClick={() => setTeam(id)}
            >
              <span>{name}</span>
              <em>{people.filter((p) => (p.supervisorId ?? "unassigned") === id).length.toLocaleString("en-US")}</em>
            </button>
          ))}
        </div>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState title="Nobody to show" hint="No RSO or BP in scope has a support code counted for this day." />
      ) : (
        <OpsTable wide>
          <SupportPeopleRows rows={rows} />
        </OpsTable>
      )}
    </Card>
  );
}

/**
 * Head and body only — `OpsTable` supplies the table. See CampaignViews.
 *
 * It lives HERE rather than in SupportViews because SupportViews is a server
 * module: it reads `SSO_MIN_MONTHLY_STANDARD_GA` from lib/business-rules, which
 * imports Prisma. This file is `"use client"`, so importing SupportViews from
 * it would pull Prisma into the browser bundle —
 * `tests/client-bundle.smoke.test.ts` caught exactly that.
 */
export function SupportPeopleRows({ rows }: { rows: SupportPersonRow[] }) {
  return (
    <>
      <thead>
        <tr role="row">
          <th role="columnheader" scope="col">
            Who
          </th>
          <th role="columnheader" scope="col">
            Supervisor
          </th>
          <th role="columnheader" scope="col">
            Codes counted
          </th>
          <th role="columnheader" scope="col" className="is-right">
            SIMs
          </th>
          <th role="columnheader" scope="col">
            Slab
          </th>
          <th role="columnheader" scope="col" className="is-right">
            Slab pay
          </th>
          <th role="columnheader" scope="col">
            SSO today
          </th>
          <th role="columnheader" scope="col" className="is-right">
            SSO offer
          </th>
          <th role="columnheader" scope="col" className="is-right">
            Total
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr role="row" key={`${p.kind}-${p.key}`}>
            <td role="cell" data-label="Who">
              {p.name}
              <span className="kit-hint is-xs"> {p.kind}</span>
            </td>
            <td role="cell" data-label="Supervisor">
              {p.supervisor}
            </td>
            <td role="cell" data-label="Codes counted">
              {p.slabOutlets.map((o) => o.retailerCode).join(", ") || "—"}
            </td>
            <td role="cell" data-label="SIMs" className="is-right">
              {num(p.earning.sims)}
            </td>
            <td role="cell" data-label="Slab">
              {p.earning.slab ? `From ${num(p.earning.slab.minSims)}` : "—"}
            </td>
            <td role="cell" data-label="Slab pay" className="is-right">
              {p.earning.slabAmount ? money(p.earning.slabAmount) : "—"}
            </td>
            <td role="cell" data-label="SSO today">
              {p.ssoOutlets.length ? p.ssoOutlets.map((o) => o.retailerCode).join(", ") : "—"}
            </td>
            <td role="cell" data-label="SSO offer" className="is-right">
              {p.earning.ssoBonus ? money(p.earning.ssoBonus) : "—"}
            </td>
            <td role="cell" data-label="Total" className="is-right">
              <b>{p.earning.total ? money(p.earning.total) : "—"}</b>
            </td>
          </tr>
        ))}
      </tbody>
    </>
  );
}
