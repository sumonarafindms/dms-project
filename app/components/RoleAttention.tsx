/**
 * Attention list — migrated to the role-UI kit.
 *
 * Shared by the manager, supervisor and RSO attention centres. The three
 * pages already wrap this in a kit Card, so it renders rows rather than a
 * second card layer. Priority and reasons come from lib/retailer-opportunities
 * unchanged; nothing is computed here.
 */

import { Badge, EmptyState, Row } from "./Kit";
import { Icon } from "./icons";
import type { RetailerOpportunity } from "../../lib/retailer-opportunities";

/** P3 and above is what the attention pages count as high priority. */
function priorityTone(priority: number) {
  return priority >= 3 ? "behind" : priority === 2 ? "near" : "neutral";
}

export function RoleAttentionList({
  rows,
  base,
  limit,
  query = "",
}: {
  rows: RetailerOpportunity[];
  base: string;
  limit?: number;
  query?: string;
}) {
  const shown = typeof limit === "number" ? rows.slice(0, limit) : rows;

  if (!shown.length)
    return (
      <EmptyState
        positive
        title="No attention items"
        hint="Current retailer execution rules are complete for this scope."
        icon={<Icon name="check" />}
      />
    );

  return (
    <div className="kit-rows">
      {shown.map((r) => (
        <Row
          key={r.id}
          href={`${base}/${r.id}${query}`}
          avatar={r.retailerName || r.retailerCode}
          title={r.retailerName || r.retailerCode}
          sub={`${r.retailerCode} · ${r.employeeName} · ${r.route}`}
          // Only the first two reasons, as before — a retailer can trip four
          // rules at once and the row would then be taller than it is wide.
          detail={r.reasons.slice(0, 2).join(" · ")}
          value={r.ga}
          valueSub={`GA · ${r.c2sTransactions} trx`}
          after={
            <div className="kit-row-actions">
              <Badge tone={priorityTone(r.priority)}>P{r.priority}</Badge>
            </div>
          }
        />
      ))}
    </div>
  );
}
