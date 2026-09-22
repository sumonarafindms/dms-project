/**
 * The campaign screens, shared so the five roles see one product.
 *
 * A Server Component on purpose — the level tabs are the only interactive part
 * and they live in their own client island (`CampaignLevels`). Everything here
 * renders on the server, which keeps the campaign rows out of the flight
 * payload; v188 is the reason that matters.
 */

import { AppLink as Link } from "./AppLink";
import { Badge, Card, EmptyState, SectionHead, StatPill, type BadgeTone } from "./Kit";
import { Icon } from "./icons";
import {
  CAMPAIGN_PHASE_LABEL,
  CAMPAIGN_SCOPE_LABEL,
  campaignDays,
  campaignPace,
  progressLabel,
  type CampaignPhase,
  type CampaignProgress,
  type CampaignRule,
} from "../../lib/campaign";
import type { CampaignEmployeeRow, CampaignReport, CampaignSupervisorRow } from "../../lib/campaign-data";
import { fmtDate } from "../../lib/format";

const num = (n: number) => n.toLocaleString("en-US");

/**
 * Running is the only phase worth colouring; the other two are just facts.
 *
 * The tones come from `BadgeTone` rather than being invented here — a new tone
 * would need a new class in kit.css and a new contrast measurement, and this
 * badge says nothing the existing three cannot.
 */
function phaseTone(phase: CampaignPhase): BadgeTone {
  if (phase === "RUNNING") return "active";
  if (phase === "UPCOMING") return "pending";
  return "inactive";
}

export function CampaignPhaseBadge({ phase }: { phase: CampaignPhase }) {
  return <Badge tone={phaseTone(phase)}>{CAMPAIGN_PHASE_LABEL[phase]}</Badge>;
}

/**
 * "1 Oct 2026 – 10 Oct 2026 · 10 days".
 *
 * Both ends through `fmtDate`, so the locale and the display time zone come
 * from `lib/format` like every other date in this app. Dropping the first
 * year when the two match would read a little tighter and would mean this
 * function deciding a format of its own; the shared one wins.
 */
export function campaignWindowLabel(c: Pick<CampaignRule, "startDate" | "endDate">) {
  const days = campaignDays(c);
  const at = (ymd: string) => fmtDate(`${ymd}T00:00:00.000Z`);
  return `${at(c.startDate)} – ${at(c.endDate)} · ${days} day${days === 1 ? "" : "s"}`;
}

/**
 * The bar under a campaign figure.
 *
 * No target, no bar — v183's ruling, applied here rather than reached for
 * through `ProgressLine`, which takes a number and would draw 0%.
 */
export function CampaignBar({ progress }: { progress: CampaignProgress }) {
  if (progress.percent === null) return <p className="kit-hint is-xs">No target set for this level</p>;
  const width = Math.max(2, Math.min(100, progress.percent));
  return (
    <div className="cmp-bar" aria-hidden="true">
      <i className={progress.complete ? "is-done" : undefined} style={{ width: `${width}%` }} />
    </div>
  );
}

/**
 * One campaign on the list. The whole card is the link.
 *
 * `mine` is the reader's OWN line, and when it is given it becomes the
 * headline. An RSO opening this list wants their own number; the
 * distribution's 67,398 above their 25 reads as if they were 67,398 ahead.
 * The company figure stays, in the footer, as context.
 */
export function CampaignCard({
  report,
  href,
  mine,
}: {
  report: Pick<CampaignReport, "campaign" | "phase" | "daysLeft" | "company">;
  href: string;
  /** Pass for an RSO or BP; omit for everyone who reads the total first. */
  mine?: CampaignProgress | null;
}) {
  const { campaign, company, phase, daysLeft } = report;
  const lead = mine ?? company;
  const pace = campaignPace(lead, daysLeft);
  const excluded = mine ? mine.target === 0 : false;
  return (
    <Link href={href} className="kit-card is-clickable cmp-card">
      <div className="cmp-card-head">
        <div>
          <strong className="cmp-card-name">{campaign.name}</strong>
          <span className="kit-hint is-xs">{campaignWindowLabel(campaign)}</span>
        </div>
        <CampaignPhaseBadge phase={phase} />
      </div>
      <p className="cmp-card-figure">
        <b>{num(lead.achieved)}</b>
        {excluded ? (
          <span>SIMs · not in this campaign</span>
        ) : lead.target === null ? (
          <span>SIMs · no target</span>
        ) : (
          <span>of {num(lead.target)} SIMs</span>
        )}
      </p>
      {excluded ? null : <CampaignBar progress={lead} />}
      <div className="cmp-card-foot">
        <span>{mine ? `Everyone: ${num(company.achieved)}` : CAMPAIGN_SCOPE_LABEL[campaign.scope]}</span>
        {phase === "RUNNING" && pace.perDay !== null ? (
          <span>
            {num(pace.perDay)}/day for {daysLeft} day{daysLeft === 1 ? "" : "s"}
          </span>
        ) : phase === "RUNNING" && company.complete ? (
          <span className="is-done">Target met</span>
        ) : null}
      </div>
    </Link>
  );
}

/** The figures above a campaign's tables. */
export function CampaignSummary({ report }: { report: CampaignReport }) {
  const { company, phase, daysLeft } = report;
  const pace = campaignPace(company, daysLeft);
  return (
    <div className="kit-summary-strip">
      <Card padded>
        <StatPill value={company.target === null ? "—" : num(company.target)} label="Target" />
      </Card>
      <Card padded>
        <StatPill value={num(company.achieved)} label="Done" />
      </Card>
      <Card padded>
        <StatPill value={company.remaining === null ? "—" : num(company.remaining)} label="To go" />
      </Card>
      <Card padded>
        <StatPill
          value={phase === "ENDED" ? "Ended" : phase === "UPCOMING" ? `${daysLeft}` : `${daysLeft}`}
          label={phase === "UPCOMING" ? "Days when it starts" : "Days left"}
        />
      </Card>
      <Card padded>
        {/* A pace nobody can compute is a dash, never a zero. */}
        <StatPill value={pace.perDay === null ? "—" : num(pace.perDay)} label="Needed per day" />
      </Card>
    </div>
  );
}

/**
 * The reader's own line, at the top of their own screen.
 *
 * An RSO or BP opens a campaign to answer one question — how many more? — so
 * that is the largest thing on the page.
 */
export function CampaignMine({ row, label }: { row: CampaignEmployeeRow | null; label: string }) {
  if (!row)
    return (
      <Card padded>
        <EmptyState
          title="This campaign has no number for you"
          hint="It is set for the whole distribution, so there is one total rather than a target each."
          icon={<Icon name="info" />}
        />
      </Card>
    );
  const p = row.progress;
  return (
    <Card padded className="cmp-mine">
      <span className="kit-label">{label}</span>
      <p className="cmp-mine-figure">
        <b>{num(p.achieved)}</b>
        {p.target === null ? <span>SIMs · no target</span> : <span>of {num(p.target)}</span>}
      </p>
      <CampaignBar progress={p} />
      {/*
        Three different sentences, because they are three different facts. A
        target of ZERO is a decision somebody made — "this person is out of
        this campaign" — and reading it as "nobody set you one" would hide that.
      */}
      <p className="cmp-mine-note">
        {p.target === 0
          ? "You are not in this campaign. Your SIMs still count toward the distribution's total."
          : p.target === null
            ? "Nobody set you a number for this campaign. Your SIMs still count toward the team."
            : p.complete
              ? "Complete — every SIM from here is over the top."
              : `${num(p.remaining ?? 0)} more SIM${(p.remaining ?? 0) === 1 ? "" : "s"} to finish.`}
      </p>
      {row.bpHeld > 0 && (
        <p className="kit-hint is-xs">
          Includes {num(row.bpHeld)} from the outlets you hold as a BP; {num(row.own)} are your own.
        </p>
      )}
    </Card>
  );
}

/**
 * The head and body of the supervisor table, NOT the <table>.
 *
 * `OpsTable` supplies the table element and the sideways-scrolling wrapper that
 * tells a phone user the table scrolls. Returning a second <table> here would
 * nest one inside the other, which is invalid and lays out unpredictably.
 * Empty is handled by the caller, because an empty state is a card and a card
 * cannot live inside a table.
 */
export function CampaignSupervisorRows({ rows }: { rows: CampaignSupervisorRow[] }) {
  return (
    <>
      <thead>
        <tr role="row">
          <th role="columnheader" scope="col">
            Supervisor
          </th>
          <th role="columnheader" scope="col">
            RSOs
          </th>
          <th role="columnheader" scope="col" className="is-right">
            Target
          </th>
          <th role="columnheader" scope="col" className="is-right">
            Done
          </th>
          <th role="columnheader" scope="col" className="is-right">
            To go
          </th>
          <th role="columnheader" scope="col">
            Progress
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr role="row" key={r.supervisorId ?? "unassigned"}>
            <td role="cell" data-label="Supervisor">
              {r.supervisor}
            </td>
            <td role="cell" data-label="RSOs">
              {/* Both numbers, because they differ: a team of 8 may have 6 in
                  this campaign, and "8" alone would imply all eight are behind. */}
              {r.inCampaign === r.rsos ? num(r.rsos) : `${num(r.inCampaign)} of ${num(r.rsos)}`}
            </td>
            <td role="cell" data-label="Target" className="is-right">
              {r.progress.target === null ? "—" : num(r.progress.target)}
            </td>
            <td role="cell" data-label="Done" className="is-right">
              {num(r.achieved)}
            </td>
            <td role="cell" data-label="To go" className="is-right">
              {r.progress.remaining === null ? "—" : num(r.progress.remaining)}
            </td>
            <td role="cell" data-label="Progress">
              <CampaignBar progress={r.progress} />
            </td>
          </tr>
        ))}
      </tbody>
    </>
  );
}

/** As above: head and body only. See the note on CampaignSupervisorRows. */
export function CampaignEmployeeRows({ rows }: { rows: CampaignEmployeeRow[] }) {
  return (
    <>
      <thead>
        <tr role="row">
          <th role="columnheader" scope="col">
            RSO
          </th>
          <th role="columnheader" scope="col">
            Supervisor
          </th>
          <th role="columnheader" scope="col" className="is-right">
            Target
          </th>
          <th role="columnheader" scope="col" className="is-right">
            Own
          </th>
          <th role="columnheader" scope="col" className="is-right">
            As BP
          </th>
          <th role="columnheader" scope="col" className="is-right">
            Done
          </th>
          <th role="columnheader" scope="col" className="is-right">
            To go
          </th>
          <th role="columnheader" scope="col">
            Progress
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr role="row" key={r.employeeId}>
            <td role="cell" data-label="RSO">
              {r.name}
              {r.employeeCode ? <span className="kit-hint is-xs"> {r.employeeCode}</span> : null}
            </td>
            <td role="cell" data-label="Supervisor">
              {r.supervisor}
            </td>
            <td role="cell" data-label="Target" className="is-right">
              {r.target === null ? "—" : num(r.target)}
            </td>
            <td role="cell" data-label="Own" className="is-right">
              {num(r.own)}
            </td>
            <td role="cell" data-label="As BP" className="is-right">
              {r.bpHeld ? num(r.bpHeld) : "—"}
            </td>
            <td role="cell" data-label="Done" className="is-right">
              {num(r.achieved)}
            </td>
            <td role="cell" data-label="To go" className="is-right">
              {r.progress.remaining === null ? "—" : num(r.progress.remaining)}
            </td>
            <td role="cell" data-label="Progress">
              <CampaignBar progress={r.progress} />
            </td>
          </tr>
        ))}
      </tbody>
    </>
  );
}

/** The note a distribution-wide campaign carries instead of per-person tables. */
export function CampaignDistributionNote() {
  return (
    <>
      <SectionHead
        title="One total, not a number each"
        sub="This campaign was set for the whole distribution, so there is no per-RSO target to show."
      />
      <Card padded>
        <EmptyState
          title="No per-RSO breakdown exists"
          hint="Everyone's SIMs count toward the one total above. To give each RSO a number, create a per-RSO campaign instead."
          icon={<Icon name="info" />}
        />
      </Card>
    </>
  );
}

export { progressLabel };
