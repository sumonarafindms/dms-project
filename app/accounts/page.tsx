/**
 * Accounts home.
 *
 * The six approved demos do not include an ACCOUNTS role, so this page is
 * assembled from their shared vocabulary rather than copied from one of them:
 * PageHeader, SummaryStrip, SectionHead and Tile, with the same spacing and
 * the same status colours. It reads as the same product as the other roles.
 *
 * Accounts is the data-entry role, so the page answers one question first —
 * "is today's data in yet?" — before offering the import workspaces.
 *
 * Every figure below is a real query. Where a feed has never been imported the
 * card says so rather than showing a zero, because a zero here would read as
 * "imported, and it was empty".
 */

import { requirePagePermission } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { latestDailySnapshot } from "../../lib/intelligence";
import { dhakaTodayYmd } from "../../lib/business-time";
import { Badge, Card, PageHeader, SectionHead, SummaryStrip, Tile } from "../components/Kit";
import { Icon } from "../components/icons";

export const dynamic = "force-dynamic";

const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

/** A feed is "current" when its latest business date is today or yesterday. */
function freshness(businessDate: Date | null | undefined) {
  const date = ymd(businessDate);
  // "pending", not "neutral": a feed that has never been imported counts
  // against "Feeds Current" in the strip above, so its badge has to look like
  // it does rather than reading as a calm no-op.
  if (!date) return { tone: "pending" as const, label: "No import yet", date: "—" };
  const today = dhakaTodayYmd();
  const yesterday = ymd(new Date(new Date(`${today}T00:00:00Z`).getTime() - 86400000))!;
  if (date === today) return { tone: "complete" as const, label: "Current", date };
  if (date === yesterday) return { tone: "complete" as const, label: "Yesterday", date };
  return { tone: "pending" as const, label: "Behind", date };
}

export default async function Accounts() {
  const u = await requirePagePermission(["ACCOUNTS"], "dashboard");
  const [rsos, retailers, bps, daily, lastGa, lastC2c, lastC2s, lastOb] = await Promise.all([
    prisma.employee.count({ where: { active: true } }),
    prisma.retailer.count({ where: { active: true } }),
    // A BP is a retailer holding a live BpAssignment — that assignment, not
    // the BP login account, is what makes a retailer a BP. See lib/ownership.ts.
    prisma.bpAssignment.count({ where: { active: true } }),
    latestDailySnapshot(),
    ...(["GA", "C2C", "C2S", "OB"] as const).map((type) =>
      prisma.importBatch.findFirst({
        where: { type },
        orderBy: { uploadedAt: "desc" },
        select: { businessDate: true, uploadedAt: true, status: true, fileName: true },
      }),
    ),
  ]);

  const feeds = [
    { key: "GA Activation", href: "/accounts/operations/ga", batch: lastGa },
    { key: "C2C Stock Lifting", href: "/accounts/operations/c2c", batch: lastC2c },
    { key: "C2S Retail Sales", href: "/accounts/operations/c2s", batch: lastC2s },
    { key: "Opening Balance", href: "/accounts/operations/ob", batch: lastOb },
  ];
  const behind = feeds.filter((f) => freshness(f.batch?.businessDate).tone !== "complete").length;

  return (
    <main className="page">
      <PageHeader title="Operations" subtitle={`${u.displayName} · Accounts`} />

      <SummaryStrip
        items={[
          {
            label: "Feeds Current",
            value: `${feeds.length - behind}/${feeds.length}`,
            tone: behind ? "amber" : "teal",
          },
          { label: "Latest GA", value: daily.gaTotal.toLocaleString() },
          { label: "Active Retailers", value: retailers.toLocaleString() },
          { label: "RSO · BP", value: `${rsos} · ${bps}` },
        ]}
      />

      <SectionHead
        title="Data freshness"
        sub="Checked against the latest import's business date, not its upload time."
      />
      <div className="kit-card-grid is-quad kit-mb-20">
        {feeds.map((f) => {
          const state = freshness(f.batch?.businessDate);
          return (
            <Card key={f.key} padded>
              <div className="kit-feed-head">
                <div className="kit-min0">
                  <span className="kit-label">{f.key}</span>
                  <strong className="kit-figure">{state.date}</strong>
                </div>
                <Badge tone={state.tone}>{state.label}</Badge>
              </div>
              <p className="kit-feed-file" title={f.batch?.fileName ?? ""}>
                {f.batch?.fileName ?? "Nothing imported for this feed yet"}
              </p>
            </Card>
          );
        })}
      </div>

      <SectionHead title="Import workspaces" sub="Each feed validates before anything reaches the database." />
      <div className="kit-card-grid kit-mb-20">
        <Tile
          href="/accounts/operations/ga"
          icon={<Icon name="sim" />}
          title="GA Activation"
          sub="Activation details and daily GA"
        />
        <Tile
          href="/accounts/operations/c2c"
          icon={<Icon name="wallet" />}
          title="C2C Stock Lifting"
          sub="Retailer lifting and recharge"
        />
        <Tile
          href="/accounts/operations/c2s"
          icon={<Icon name="chart" />}
          title="C2S Retail Sales"
          sub="Retail sales and LSO progress"
        />
        <Tile
          href="/accounts/operations/ob"
          icon={<Icon name="balance" />}
          title="Opening Balance"
          sub="Latest retailer balance snapshot"
        />
        <Tile
          href="/accounts/operations/targets"
          icon={<Icon name="target" />}
          title="SC & Targets"
          sub="Monthly RSO and BP targets"
        />
      </div>

      <SectionHead title="Reference" />
      <div className="kit-card-grid">
        <Tile
          admin
          href="/accounts/retailers"
          icon={<Icon name="search" />}
          title="Retailer Search"
          sub={`${retailers.toLocaleString()} active outlets`}
        />
        <Tile
          admin
          href="/accounts/attention"
          icon={<Icon name="target" />}
          title="Opportunity"
          sub="Unfinished SSO / LSO execution"
        />
        <Tile
          admin
          href="/accounts/people"
          icon={<Icon name="users" />}
          title="RSO & BP Reference"
          sub={`${rsos} RSOs · ${bps} BP assignments`}
        />
      </div>
    </main>
  );
}
