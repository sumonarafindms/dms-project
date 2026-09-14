import Link from "next/link";
import { requireUser } from "../../lib/auth";
import { buildLiveGa, dhakaToday, type LiveRow, type LiveSection } from "../../lib/live-ga";
import { Avatar, Card, fmt } from "../components/Kit";
import { Icon } from "../components/icons";

/**
 * Today's GA, for whoever is signed in.
 *
 * Every other GA screen in this app is a period. This one answers the question
 * an RSO asks in the middle of the afternoon — how many today? — and gives the
 * people above them the same question at their own level.
 *
 * ## How it is laid out, and why
 *
 * One number, then the people behind it. The first version put the headline,
 * the freshness line and an upload's file name in one stack of small grey
 * text, and the result read as a settings panel rather than a status board —
 * the number you came for had the same weight as the name of a spreadsheet.
 *
 * So: a LIVE badge and the date sit above the figure, the figure is the
 * largest thing on the page, and "updated at" is one quiet line beneath it.
 * The file name is gone entirely — it answered a question nobody asked.
 *
 * Each row carries a share bar, which is the cheapest way to turn a column of
 * numbers into a ranking you can read at a glance on a phone. It is drawn
 * against the biggest row rather than the total, because the useful comparison
 * on a list of ten RSOs is with the best of them, not with a total nobody is
 * expected to reach alone.
 *
 * Deliberately NOT cached: a live screen that serves a stale answer is worse
 * than one that takes another moment.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

function Rows({ rows }: { rows: LiveRow[] }) {
  const best = rows.reduce((n, r) => Math.max(n, r.count), 0);
  return (
    <ul className="live-list">
      {rows.map((r) => {
        const body = (
          <>
            <Avatar name={r.name} />
            <span className="live-row-body">
              <span className="live-row-head">
                <strong>{r.name}</strong>
                <b className={`live-row-count${r.count ? "" : " is-zero"}`}>{fmt(r.count)}</b>
              </span>
              {r.meta ? <small>{r.meta}</small> : null}
              {/*
                Drawn only when somebody in the list actually did something —
                a row of empty tracks under a list of zeros is decoration.
              */}
              {best > 0 ? (
                <span className="live-row-bar" aria-hidden="true">
                  <i style={{ width: `${Math.round((r.count / best) * 100)}%` }} />
                </span>
              ) : null}
            </span>
          </>
        );
        return (
          <li key={r.id}>
            {r.href ? (
              <Link href={r.href} className="live-row is-link">
                {body}
                <Icon name="arrow" />
              </Link>
            ) : (
              <div className="live-row">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Section({ section }: { section: LiveSection }) {
  const total = section.rows.reduce((n, r) => n + r.count, 0);
  const active = section.rows.filter((r) => r.count > 0).length;
  return (
    <section className="live-section">
      <header className="live-section-head">
        <h2>{section.title}</h2>
        {section.rows.length ? (
          <span className="live-section-meta">
            {/* What the reader wants from a section header is how much of this
                list is actually working today, not how long the list is. */}
            <strong>{fmt(total)}</strong> GA · {active} of {section.rows.length} active
          </span>
        ) : null}
      </header>
      <Card padded={section.rows.length ? undefined : "lg"}>
        {section.rows.length ? <Rows rows={section.rows} /> : <p className="live-empty">{section.empty}</p>}
      </Card>
    </section>
  );
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ supervisor?: string; date?: string }>;
}) {
  /*
   * Every role, listed rather than left open. `requireUser()` with no argument
   * would admit anyone signed in and read, to the route-guard test, as a page
   * that forgot its guard — which is exactly the mistake that test exists to
   * catch. Saying "all seven, on purpose" is not the same as saying nothing.
   */
  const user = await requireUser(["ADMIN", "IT", "MANAGER", "SUPERVISOR", "ACCOUNTS", "RSO", "BP"]);
  const sp = await searchParams;

  /*
   * Today, always — unless a date is explicitly asked for. The owner was clear:
   * if nobody has activated a SIM yet, or today's file is not uploaded, the
   * answer is 0. Falling back to the last day with data would show yesterday's
   * work as though it were today's.
   */
  const today = dhakaToday();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date || "") ? sp.date! : today;

  const live = await buildLiveGa(
    {
      role: user.role,
      employeeId: user.employeeId,
      supervisorId: user.supervisorId,
      bpRetailerId: user.bpRetailerId,
      userId: user.id,
    },
    date,
    sp.supervisor,
  );

  const dayLabel = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00.000Z`));

  /*
   * Date and time, nothing else. In Dhaka time so every role reads the same
   * clock whatever their device is set to.
   */
  const updated = live.lastUpload
    ? new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: "Asia/Dhaka",
      }).format(live.lastUpload.at)
    : null;

  return (
    <main className="page live-page">
      <Card className="live-hero-card kit-mb-20" padded="lg">
        <div className="live-hero-top">
          <span className="live-badge">
            <span className="live-dot" aria-hidden="true" />
            LIVE
          </span>
          <span className="live-day">
            {dayLabel}
            {date === today ? "" : " · selected date"}
          </span>
        </div>

        <p className="live-total">{fmt(live.total)}</p>
        <p className="live-total-label">GA today · {live.scope}</p>

        {updated ? (
          <p className="live-updated">
            <Icon name="calendar" />
            Updated {updated}
          </p>
        ) : (
          <p className="live-updated is-warn">
            <Icon name="alert" />
            No GA file has been uploaded yet
          </p>
        )}

        {live.total === 0 ? (
          <p className="live-note">
            {live.lastUpload
              ? "Nothing recorded for today yet. This fills in when the day's GA file is uploaded."
              : "Once a GA file is uploaded, today's activations appear here."}
          </p>
        ) : null}
      </Card>

      {live.focus ? (
        <p className="live-focus">
          <Icon name="filter" />
          <span>
            Showing only <strong>{live.focus}</strong>&apos;s team.
          </span>
          <Link href="/live-ga">Show every supervisor</Link>
        </p>
      ) : null}

      {live.sections.map((s) => (
        <Section key={s.key} section={s} />
      ))}
    </main>
  );
}
