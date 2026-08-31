/**
 * Data Readiness Center.
 *
 * One row per feed, one cell per day, so a gap in the middle of a range is
 * visible at a glance instead of being averaged away.
 *
 * The Reporting Center's readiness cards answer "is there an import somewhere
 * in this range" — right for its default range of yesterday, and close to
 * meaningless for a month. This page answers the same question day by day, and
 * the Reporting Center now links here rather than repeating a summary it cannot
 * make honest in four cards.
 *
 * Every verdict shows its evidence: whether a batch was recorded, and how many
 * rows actually landed. That is what separates "nobody uploaded it" from "the
 * file was uploaded and contained nothing", which look identical in the Upload
 * Center and need completely different fixes.
 */

import Link from "next/link";
import { requireUser } from "../../../lib/auth";
import { resolveRange, rangeQuery, rangeLabel } from "../../../lib/report-range";
import { readinessReport } from "../../../lib/readiness-data";
import {
  DAY_STATE_LABEL,
  coverageLabel,
  dayStateTone,
  readinessWarning,
  worstState,
  type DayState,
} from "../../../lib/readiness";
import { Badge, Card, EmptyState, PageHeader, SectionHead, SummaryStrip } from "../../components/Kit";
import { ReportDateBar } from "../../components/ReportShell";
import { TableScrollHint } from "../../components/TableScrollHint";
import { Icon } from "../../components/icons";

export const dynamic = "force-dynamic";

/** The states worth a legend. `unrecorded` shares amber with `missing`. */
const LEGEND: DayState[] = ["imported", "missing", "empty", "not-due"];

export default async function ReadinessPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireUser(["ADMIN", "IT"]);
  const sp = await searchParams;
  const range = resolveRange(sp.from, sp.to);
  const report = await readinessReport(range);
  const warning = readinessWarning(report.feeds);
  const q = rangeQuery(range);

  const due = report.feeds.reduce((a, f) => a + f.due, 0);
  const covered = report.feeds.reduce((a, f) => a + f.covered, 0);
  const problems = report.feeds.flatMap((f) => f.problems.map((d) => ({ ...d, label: f.label })));

  return (
    <main className="page">
      <PageHeader
        title="Data Readiness"
        subtitle={`Which feeds actually landed, day by day, for ${rangeLabel(range)}`}
        action={
          <Link className="kit-btn size-sm is-ghost no-print" href={`/it/reports?${q}`}>
            ← Reporting Center
          </Link>
        }
      />
      <ReportDateBar range={range} />

      <SummaryStrip
        items={[
          { label: "Feed-days due", value: due.toLocaleString() },
          { label: "Imported", value: covered.toLocaleString(), tone: "teal" },
          { label: "Needs attention", value: problems.length.toLocaleString() },
          { label: "Latest due day", value: report.lastDue },
        ]}
      />

      {warning && (
        <div className="kit-note is-warn" role="status">
          <Icon name="alert" />
          <span>{warning}</span>
        </div>
      )}

      <SectionHead
        title="Day by day"
        sub="Each cell is one business day. Data arrives a day late, so today is never expected."
      />
      <Card className="kit-mb-20" padded>
        <div className="kit-readiness">
          {report.feeds.map((f) => {
            const worst = worstState(f);
            return (
              <div key={f.feed} className="kit-readiness-row">
                <div className="kit-readiness-head">
                  <strong>{f.label}</strong>
                  <span>{coverageLabel(f)}</span>
                  <Badge tone={dayStateTone(worst)}>{DAY_STATE_LABEL[worst]}</Badge>
                </div>
                <div className="kit-readiness-days" role="list" aria-label={`${f.label} by day`}>
                  {f.days.map((d) => (
                    <span
                      key={d.date}
                      role="listitem"
                      className={`kit-readiness-day tone-${dayStateTone(d.state)}`}
                      // The only text a screen reader or a hover gets, so it
                      // carries the evidence, not just the verdict.
                      title={`${d.date} · ${DAY_STATE_LABEL[d.state]} · ${d.rows.toLocaleString()} rows · ${
                        d.batch ? "batch recorded" : "no batch"
                      }`}
                      aria-label={`${d.date}: ${DAY_STATE_LABEL[d.state]}, ${d.rows.toLocaleString()} rows`}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <TableScrollHint />
        <div className="kit-readiness-legend">
          {LEGEND.map((state) => (
            <span key={state}>
              <span className={`kit-readiness-key tone-${dayStateTone(state)}`} aria-hidden="true" />
              {DAY_STATE_LABEL[state]}
            </span>
          ))}
        </div>
      </Card>

      <SectionHead title="Days to fix" sub="Worst first. Re-upload the file for each business date listed." />
      <Card padded>
        {problems.length ? (
          <div className="kit-rows">
            {problems.slice(0, 60).map((d) => (
              <div key={`${d.label}-${d.date}`} className="kit-row">
                <div className="kit-row-main">
                  <strong>
                    {d.label} · {d.date}
                  </strong>
                  <span>
                    {d.batch ? "An import was recorded" : "No import recorded"} · {d.rows.toLocaleString()} rows
                  </span>
                </div>
                <Badge tone={dayStateTone(d.state)}>{DAY_STATE_LABEL[d.state]}</Badge>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            positive
            title="Every due day is imported"
            hint="Reports for this period are complete."
            icon={<Icon name="check" />}
          />
        )}
        {problems.length > 60 && (
          <p className="kit-hint is-xs kit-mt-8">
            Showing the 60 most urgent of {problems.length.toLocaleString()}. Narrow the date range to see the rest.
          </p>
        )}
      </Card>
    </main>
  );
}
