/**
 * Reporting Center home.
 *
 * The IT demo's landing screen, wired to real data. Three things it shows are
 * only shown when they can be answered honestly:
 *
 *   Data Readiness — per-day coverage from lib/readiness-data.ts, with a link
 *     to the full grid. It used to ask whether ONE completed batch existed
 *     anywhere in the range, which is right for the default range of yesterday
 *     and badly wrong for a month: a single GA import on the 3rd painted the
 *     whole of August green while the totals below were missing thirty days.
 *     Now the card reads "27 of 31 days" and only says Imported when every due
 *     day is.
 *   Daily Performance — real aggregates over the selected range.
 *   Report Shortcuts — every card links onward carrying the current range, so
 *     the period a user picked here survives into the report they open.
 *
 * Reports that are not built yet are simply not listed. A shortcut that opens
 * an empty page is worse than no shortcut.
 */

import Link from "next/link";
import { requireUser } from "../../../lib/auth";
import { resolveRange, rangeQuery } from "../../../lib/report-range";
import { rangeTotals } from "../../../lib/report-data";
import { readinessReport } from "../../../lib/readiness-data";
import { DAY_STATE_LABEL, coverageLabel, dayStateTone, readinessWarning, worstState } from "../../../lib/readiness";
import { Badge, Card, PageHeader, SectionHead, SummaryStrip } from "../../components/Kit";
import { ReportDateBar } from "../../components/ReportShell";
import { Icon } from "../../components/icons";

export const dynamic = "force-dynamic";

// All fourteen reports from the IT demo. Every entry here resolves to a real
// page — a shortcut that opens an empty page is worse than no shortcut.
const SHORTCUTS = [
  { href: "daily", label: "Daily Summary", hint: "Supervisor-wise period overview", icon: "file" },
  { href: "activation", label: "SIM / Activation", hint: "By supervisor, RSO or BP", icon: "sim" },
  { href: "performance/supervisor", label: "Supervisor Performance", hint: "Ranked by achievement", icon: "users" },
  { href: "performance/rso", label: "RSO Performance", hint: "Ranked by achievement", icon: "chart" },
  { href: "performance/bp", label: "BP Performance", hint: "SIM target vs achieved", icon: "sim" },
  { href: "performance/retailer", label: "Retailer Performance", hint: "Ranked by GA volume", icon: "shop" },
  { href: "sso", label: "SSO Pending", hint: "Most incomplete first", icon: "phone" },
  { href: "lso", label: "LSO Pending", hint: "Most incomplete first", icon: "chart" },
  { href: "c2c", label: "C2C Report", hint: "Supervisor / RSO / Retailer", icon: "wallet" },
  { href: "c2s", label: "C2S Report", hint: "Supervisor / RSO / Retailer", icon: "chart" },
  { href: "low-c2s", label: "Low C2S Retailers", hint: "Lowest retail sales first", icon: "alert" },
  { href: "ob", label: "Opening Balance", hint: "Retailer-wise balance snapshot", icon: "balance" },
  { href: "target", label: "Target vs Achievement", hint: "GA, SSO, LSO and C2C", icon: "target" },
  { href: "custom", label: "Custom Report", hint: "Pick the level and columns", icon: "settings" },
] as const;

export default async function ReportsHome({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireUser(["ADMIN", "IT"]);
  const sp = await searchParams;
  const range = resolveRange(sp.from, sp.to);
  const [readiness, totals] = await Promise.all([readinessReport(range), rangeTotals(range)]);
  const warning = readinessWarning(readiness.feeds);
  const q = rangeQuery(range);

  return (
    <main className="page">
      <PageHeader
        title="Reporting Center"
        subtitle="Operational reports, performance summaries and daily business insights"
      />
      <ReportDateBar range={range} />

      <SectionHead
        title="Data readiness"
        sub="How many days of the selected period each feed actually landed for."
        link={
          <Link className="no-print" href={`/it/readiness?${q}`}>
            Day-by-day view →
          </Link>
        }
      />
      <div className="kit-summary-strip">
        {readiness.feeds.map((f) => {
          const worst = worstState(f);
          return (
            <Card key={f.feed} padded>
              <div className="kit-row-between">
                <strong className="kit-rowtitle">{f.label}</strong>
                <Badge tone={dayStateTone(worst)}>{DAY_STATE_LABEL[worst]}</Badge>
              </div>
              <p className="kit-hint is-xs kit-mt-6">{coverageLabel(f)}</p>
            </Card>
          );
        })}
      </div>

      {warning && (
        <div className="kit-note is-warn" role="status">
          <Icon name="alert" />
          <span>
            {warning} <Link href={`/it/readiness?${q}`}>See which days →</Link>
          </span>
        </div>
      )}

      <SectionHead title="Performance" sub="Totals across the selected period." />
      <SummaryStrip
        items={[
          { label: "Total GA", value: totals.standardGa.toLocaleString(), tone: "teal" },
          { label: "SIM Swap", value: totals.simSwap.toLocaleString() },
          { label: "Total C2C", value: `৳${Math.round(totals.c2cAmount).toLocaleString()}` },
          { label: "Total C2S", value: `৳${Math.round(totals.c2sAmount).toLocaleString()}` },
        ]}
      />

      <SectionHead title="Reports" />
      <div className="kit-card-grid">
        {SHORTCUTS.map((s) => (
          <Link key={s.href} href={`/it/reports/${s.href}?${q}`} className="kit-card is-clickable kit-tile">
            <span className="kit-tile-icon" aria-hidden="true">
              <Icon name={s.icon} />
            </span>
            <div>
              <strong>{s.label}</strong>
              <span>{s.hint}</span>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
