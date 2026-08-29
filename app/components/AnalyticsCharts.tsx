/**
 * Team comparison chart — migrated to the role-UI kit.
 *
 * One block per team: the team's name and scope on the left, then two kit
 * bars — recharge achievement and GA achievement. The bars carry the kit's
 * own achievement bands (teal at 80%+, amber, rose), so a team that is behind
 * on GA but fine on recharge reads at a glance, which the old fixed
 * indigo/teal pair could not show.
 *
 * The caller supplies percentages already computed by lib/performance; nothing
 * is recalculated here beyond clamping the bar width.
 */

import { Bar, EmptyState } from "./Kit";
import { Icon } from "./icons";

type ChartDatum = { label: string; value: number; secondary?: number; meta?: string };

/** Only this many teams fit before the block becomes a scroll instead of a chart. */
const MAX_ROWS = 6;

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="kit-metric-head">
        <span className="kit-label">{label}</span>
        <span className="kit-metric-value">
          <b>{Math.round(value)}%</b>
        </span>
      </div>
      <Bar value={value} thin />
    </div>
  );
}

export function ComparisonChart({ data }: { data: ChartDatum[] }) {
  const rows = data.slice(0, MAX_ROWS);

  if (!rows.length)
    return (
      <EmptyState
        title="No team data available"
        hint="Nothing to compare in this range."
        icon={<Icon name="chart" />}
      />
    );

  return (
    <div className="kit-compare">
      {rows.map((x, i) => (
        <div className="kit-compare-row" key={`${x.label}-${i}`}>
          <div className="kit-compare-who">
            <strong>{x.label}</strong>
            {x.meta && <span>{x.meta}</span>}
          </div>
          <div className="kit-compare-bars">
            <Metric label="Recharge" value={x.value} />
            <Metric label="GA" value={x.secondary || 0} />
          </div>
        </div>
      ))}
    </div>
  );
}
