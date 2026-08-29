import Link from "next/link";
import { requirePagePermission } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { monthBounds } from "../../../lib/month";
import { dhakaMonth } from "../../../lib/business-time";
import { withStandardGa } from "../../../lib/business-rules";
import { Badge, Card, EmptyState, HeroRing, PageHeader, Row, SectionHead, StatPill } from "../../components/Kit";
import { Icon } from "../../components/icons";
import { targetPercent } from "../../../lib/achievement";

export default async function Page() {
  const u = await requirePagePermission(["RSO"], "bp");
  if (!u.employeeId)
    return (
      <main className="page">
        <PageHeader title="Account not mapped" subtitle="Ask Admin to link this login to an RSO employee." />
        <Card>
          <EmptyState title="Account not mapped" icon={<Icon name="alert" />} />
        </Card>
      </main>
    );
  const month = dhakaMonth() + "-01",
    { start, end } = monthBounds(month);
  const [current, history] = await Promise.all([
    prisma.bpAssignment.findFirst({
      where: { employeeId: u.employeeId, active: true },
      include: {
        retailer: {
          select: {
            retailerCode: true,
            retailerName: true,
            bpUser: { select: { displayName: true, mobileNumber: true, active: true, role: true } },
          },
        },
        monthlyTargets: { where: { month: start }, take: 1 },
      },
    }),
    prisma.bpAssignment.findMany({
      where: { employeeId: u.employeeId, active: false },
      orderBy: { endDate: "desc" },
      take: 8,
      include: { retailer: { select: { retailerCode: true, retailerName: true } } },
    }),
  ]);

  if (!current)
    return (
      <main className="page">
        <PageHeader title="No active BP" subtitle="Admin has not selected a current BP retailer code under your RSO." />
        <SectionHead
          title="BP history"
          sub={`${history.length} previous assignment${history.length === 1 ? "" : "s"}`}
        />
        <Card padded>
          {history.length ? (
            <div className="kit-rows">
              {history.map((h) => (
                <Row
                  key={h.id}
                  icon={<Icon name="users" />}
                  title={h.retailer.retailerName || h.retailer.retailerCode}
                  sub={h.retailer.retailerCode}
                  value={h.startDate.toISOString().slice(0, 10)}
                  valueSub={`to ${h.endDate?.toISOString().slice(0, 10) || "ended"}`}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No previous BP codes"
              hint="This is the first recorded assignment."
              icon={<Icon name="users" />}
            />
          )}
        </Card>
      </main>
    );

  const target = current.monthlyTargets[0]?.gaTarget ?? current.gaTarget;
  const ga = await prisma.gaActivation.count({
    where: withStandardGa({ retailerId: current.retailerId, activationDate: { gte: start, lt: end } }),
  });
  const login =
    current.retailer.bpUser?.active && current.retailer.bpUser.role === "BP" ? current.retailer.bpUser : null;

  return (
    <main className="page">
      <PageHeader
        title={current.retailer.retailerName || current.retailer.retailerCode}
        subtitle={`${current.retailer.retailerCode} · Active since ${current.startDate.toISOString().slice(0, 10)}`}
        action={<Badge tone="active">Active</Badge>}
      />

      <HeroRing
        label="Monthly GA"
        percent={targetPercent(ga, target)}
        figures={[
          { label: "Target", value: target || "—" },
          { label: "Achieved", value: ga, tone: "teal" },
          { label: "Remaining", value: target ? Math.max(0, target - ga) : "—", tone: "amber" },
        ]}
      />

      <Card className="kit-my-16" padded>
        <div className="kit-pill-grid">
          <StatPill value={current.retailer.retailerCode} label="BP Code" />
          <StatPill value={target || "—"} label="GA Target" />
          <StatPill value={login ? login.displayName : "Not created"} label="Login" />
          <StatPill value={login?.mobileNumber || "—"} label="Login Mobile" />
        </div>
      </Card>

      <Link href="/rso/bp/activations" className="kit-card is-clickable kit-tile">
        <span className="kit-tile-icon" aria-hidden="true">
          <Icon name="sim" />
        </span>
        <div>
          <strong>View BP Activation Details</strong>
          <span>SIM sales, dates and activation records</span>
        </div>
      </Link>

      <div className="kit-mt-20">
        <SectionHead title="Previous BP codes" />
        <Card padded>
          {history.length ? (
            <div className="kit-rows">
              {history.map((h) => (
                <Row
                  key={h.id}
                  icon={<Icon name="users" />}
                  title={h.retailer.retailerName || h.retailer.retailerCode}
                  sub={h.retailer.retailerCode}
                  value={h.startDate.toISOString().slice(0, 10)}
                  valueSub={`to ${h.endDate?.toISOString().slice(0, 10) || "ended"}`}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No previous BP codes"
              hint="This is the first recorded assignment."
              icon={<Icon name="users" />}
            />
          )}
        </Card>
      </div>
    </main>
  );
}
