/**
 * Reporting Center home.
 *
 * The IT demo's landing screen, wired to real data. Three things it shows are
 * only shown when they can be answered honestly:
 *
 *   Data Readiness — from ImportBatch business dates, never inferred from
 *     whether rows exist. A feed with no successful import for the selected
 *     period reads "Missing", and the page says outright that reports may be
 *     incomplete because of it.
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
import { dataReadiness, rangeTotals } from "../../../lib/report-data";
import { Badge, Card, PageHeader, SectionHead, SummaryStrip } from "../../components/Kit";
import { ReportDateBar } from "../../components/ReportShell";
import { Icon } from "../../components/icons";

export const dynamic = "force-dynamic";

const FEED_LABEL: Record<string, string> = {
  GA: "GA Activation",
  C2C: "C2C",
  C2S: "C2S",
  OB: "Opening Balance",
};

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
  const [feeds, totals] = await Promise.all([dataReadiness(range), rangeTotals(range)]);
  const missing = feeds.filter((f) => !f.ready);
  const q = rangeQuery(range);

  return (
    <main className="page">
      <PageHeader
        title="Reporting Center"
        subtitle="Operational reports, performance summaries and daily business insights"
      />
      <ReportDateBar range={range} />

      <SectionHead title="Data readiness" sub="Whether each feed was actually imported for the selected period." />
      <div className="kit-summary-strip">
        {feeds.map((f) => (
          <Card key={f.feed} padded>
            <div className="kit-row-between">
              <strong className="kit-rowtitle">
                {FEED_LABEL[f.feed] ?? f.feed}
              </strong>
              <Badge tone={f.ready ? "complete" : "pending"}>{f.ready ? "Ready" : "Missing"}</Badge>
            </div>
            <p className="kit-hint is-xs kit-mt-6">
              {f.ready && f.uploadedAt
                ? `Imported ${f.uploadedAt.toISOString().slice(0, 16).replace("T", " ")}`
                : "No import covering this period"}
            </p>
          </Card>
        ))}
      </div>

      {missing.length > 0 && (
        <div className="kit-note is-warn" role="status">
          <Icon name="alert" />
          <span>
            Reports for this period may be incomplete — {missing.map((f) => FEED_LABEL[f.feed] ?? f.feed).join(", ")}{" "}
            {missing.length === 1 ? "has" : "have"} no import covering it.
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
