/**
 * Upload Center — migrated to the role-UI kit.
 *
 * The import hub: is each feed current, which module writes what, and what
 * DMS checks before anything reaches the database. Every module's `note` is
 * the rule that decides whether an upload replaces or appends stored values —
 * the one thing an operator must read first, so it is body text on the card.
 */

import { requireUser } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { ImportType } from "@prisma/client";
import { Icon } from "../../components/icons";
import { ImportHealthGrid } from "../../components/ImportHealth";
import { Card, ModuleCard, PageHeader, SectionHead } from "../../components/Kit";

const operational = [
  {
    key: "ga",
    title: "GA Upload",
    sub: "Multi-date SIM activation report",
    href: "/ga",
    sample: "/api/samples/ga",
    icon: "sim",
    note: "Each row saves by ACTIVATION_DATE · SIM_NO duplicate-safe · EV-SWAP price 100",
    tag: "MULTI-DATE",
  },
  {
    key: "c2c",
    title: "C2C Upload",
    sub: "Stock lifting report",
    href: "/c2c",
    sample: "/api/samples/c2c",
    icon: "wallet",
    note: "Cumulative MTD snapshot · uploaded month replaces stale stored C2C values",
    tag: "MTD",
  },
  {
    key: "c2s",
    title: "C2S Upload",
    sub: "Retailer sales report",
    href: "/c2s",
    sample: "/api/samples/c2s",
    icon: "chart",
    note: "Cumulative MTD snapshot · uploaded month replaces stale sales before LSO calculation",
    tag: "MTD",
  },
  {
    key: "ob",
    title: "Opening Balance",
    sub: "Latest balance snapshot",
    href: "/ob",
    sample: "/api/samples/ob",
    icon: "balance",
    note: "Validated single-date snapshot · safe replacement",
    tag: "SNAPSHOT",
  },
];

const control = [
  {
    key: "retailers",
    title: "Retailer Master",
    sub: "Retailer identity & ownership",
    href: "/admin/upload/retailers",
    sample: "/api/samples/retailers",
    icon: "shop",
    note: "RETAILER_CODE upsert · RSO mapping verification",
    tag: "MASTER",
  },
  {
    key: "targets",
    title: "Monthly Targets",
    sub: "RSO & BP target control",
    href: "/targets",
    sample: "/api/samples/targets",
    icon: "target",
    note: "Required-heading check · row validation before update",
    tag: "MONTHLY",
  },
];

const PIPELINE = [
  { n: "01", title: "Read workbook", sub: "Open the supported Excel/TXT source." },
  { n: "02", title: "Check headings", sub: "List exact missing required columns." },
  { n: "03", title: "Verify data", sub: "Validate dates, codes, values and mappings." },
  { n: "04", title: "Import & review", sub: "Write verified rows and show exact result counts." },
];

export default async function Page() {
  await requireUser(["ADMIN", "IT"]);
  const latest = await prisma.importBatch.findMany({
    where: { type: { in: [ImportType.GA, ImportType.C2C, ImportType.C2S, ImportType.OB] } },
    orderBy: { uploadedAt: "desc" },
    select: {
      type: true,
      fileName: true,
      uploadedAt: true,
      businessDate: true,
      successRows: true,
      failedRows: true,
      duplicateRows: true,
      status: true,
    },
    take: 40,
  });
  const latestByType = new Map<string, (typeof latest)[number]>();
  for (const batch of latest) if (!latestByType.has(batch.type)) latestByType.set(batch.type, batch);
  const health = [
    { type: "GA", label: "Activation feed", ...latestByType.get(ImportType.GA) },
    { type: "C2C", label: "Stock lifting", ...latestByType.get(ImportType.C2C) },
    { type: "C2S", label: "Retailer sales", ...latestByType.get(ImportType.C2S) },
    { type: "OB", label: "Opening balance", ...latestByType.get(ImportType.OB) },
  ];

  return (
    <main className="page">
      <PageHeader
        title="Upload Center"
        subtitle="A controlled import workspace: workbook structure is checked first, source data second, and only verified records are written to DMS."
      />

      <SectionHead
        title="Data freshness"
        sub="Confirm the newest source file reached DMS before reviewing performance."
      />
      <div className="kit-mb-20">
        <ImportHealthGrid items={health} />
      </div>

      <SectionHead title="Operational feeds" sub="Field execution source files that feed performance calculations." />
      <div className="kit-card-grid is-quad kit-mb-20">
        {operational.map(({ key, icon, ...x }, i) => (
          <ModuleCard key={key} index={`0${i + 1}`} icon={<Icon name={icon} />} {...x} />
        ))}
      </div>

      <SectionHead title="Control data" sub="Reference records that control ownership, mapping and monthly goals." />
      <div className="kit-card-grid kit-mb-20">
        {control.map(({ key, icon, ...x }, i) => (
          <ModuleCard key={key} index={`0${i + 5}`} icon={<Icon name={icon} />} {...x} />
        ))}
      </div>

      <SectionHead
        title="Safe import pipeline"
        sub="DMS looks for the required headings first — if one is missing you are shown its exact name — then verifies row values, dates and retailer mapping before anything is written."
      />
      <Card padded="lg">
        <div className="kit-steps">
          {PIPELINE.map((s) => (
            <div className="kit-step" key={s.n}>
              <b>{s.n}</b>
              <span>
                <strong>{s.title}</strong>
                <small>{s.sub}</small>
              </span>
            </div>
          ))}
        </div>
      </Card>
    </main>
  );
}
