import Link from "next/link";
import { requireUser } from "../../lib/auth";
import { buildLiveGa, dhakaToday } from "../../lib/live-ga";
import { Card, EmptyState, PageHeader, SectionHead, fmt } from "../components/Kit";
import { Icon } from "../components/icons";

/**
 * Today's GA, for whoever is signed in.
 *
 * Every other GA screen in this app is a period. This one answers the question
 * an RSO asks in the middle of the afternoon — how many today? — and gives the
 * people above them the same question at their own level.
 *
 * Deliberately NOT cached: a live screen that serves a stale answer is worse
 * than one that takes another moment.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

function Updated({ at, fileName }: { at: Date; fileName: string }) {
  /*
   * The timestamp the owner asked for, and the reason it matters: a number with
   * no "as of" invites the reader to assume it is current, and on the day
   * nobody uploads the file that assumption is wrong. Rendered on the server in
   * Dhaka time so every role sees the same clock.
   */
  const when = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Dhaka",
    hour12: true,
  }).format(at);
  return (
    <p className="live-updated">
      <Icon name="check" />
      <span>
        Last GA upload: <strong>{when}</strong>
        <small>{fileName}</small>
      </span>
    </p>
  );
}

function Rows({ rows }: { rows: { id: string; name: string; meta: string | null; count: number; href?: string }[] }) {
  return (
    <ul className="live-list">
      {rows.map((r) => {
        const body = (
          <>
            <span className="live-list-name">
              <strong>{r.name}</strong>
              {r.meta ? <small>{r.meta}</small> : null}
            </span>
            <span className={`live-list-count${r.count ? "" : " is-zero"}`}>{fmt(r.count)}</span>
          </>
        );
        return (
          <li key={r.id}>
            {r.href ? (
              <Link href={r.href} className="live-list-row is-link">
                {body}
                <Icon name="arrow" />
              </Link>
            ) : (
              <div className="live-list-row">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
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

  const pretty = new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00.000Z`),
  );

  return (
    <main className="page">
      <PageHeader title="Live GA" subtitle={`${live.scope} · ${pretty}${date === today ? "" : " (selected date)"}`} />

      <Card className="kit-mb-20" padded="lg">
        <div className="live-hero">
          <span className="live-dot" aria-hidden="true" />
          <div>
            <strong className="live-total">{fmt(live.total)}</strong>
            <span className="live-total-label">GA today</span>
          </div>
        </div>
        {live.lastUpload ? (
          <Updated at={live.lastUpload.at} fileName={live.lastUpload.fileName} />
        ) : (
          <p className="live-updated is-warn">
            <Icon name="alert" />
            <span>No GA file has been uploaded yet.</span>
          </p>
        )}
        {live.total === 0 ? (
          <p className="live-note">
            {live.lastUpload
              ? "No GA has been recorded for today yet. This updates when the day's GA file is uploaded."
              : "Once a GA file is uploaded, today's activations appear here."}
          </p>
        ) : null}
      </Card>

      {live.focus ? (
        <p className="live-focus">
          Showing only <strong>{live.focus}</strong>&apos;s team. <Link href="/live-ga">Show every supervisor</Link>
        </p>
      ) : null}

      {live.sections.map((s) => (
        <section key={s.key}>
          <SectionHead title={s.title} sub={`${s.rows.length} listed`} />
          <Card className="kit-mb-20" padded>
            {s.rows.length ? <Rows rows={s.rows} /> : <EmptyState title={s.empty} />}
          </Card>
        </section>
      ))}
    </main>
  );
}
