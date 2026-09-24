/**
 * v203 — the notice board's rules, Prisma-free so the form (a client
 * component) and the API check a notice the same way.
 */

/** Who may post. The owner's pick: Admin, a Manager, Accounts — and IT, who run the app. */
export const NOTICE_POST_ROLES = ["ADMIN", "IT", "MANAGER", "ACCOUNTS"];

/** Who a notice can be for, in the order the form offers them. */
export const NOTICE_AUDIENCES = ["RSO", "BP", "SUPERVISOR", "MANAGER", "ACCOUNTS"] as const;
export type NoticeAudience = (typeof NOTICE_AUDIENCES)[number];

export const NOTICE_AUDIENCE_LABEL: Record<NoticeAudience, string> = {
  RSO: "RSOs",
  BP: "BPs",
  SUPERVISOR: "Supervisors",
  MANAGER: "Managers",
  ACCOUNTS: "Accounts",
};

/**
 * A manager speaks to their own teams — RSOs, BPs and supervisors — and their
 * notice reaches those teams only. Everybody else may address anyone.
 */
export function audiencesFor(role: string): readonly NoticeAudience[] {
  return role === "MANAGER" ? ["RSO", "BP", "SUPERVISOR"] : NOTICE_AUDIENCES;
}

export const NOTICE_TITLE_MAX = 80;
export const NOTICE_BODY_MAX = 1000;
/** The longest a notice may stay up without being re-posted. */
export const NOTICE_MAX_DAYS = 90;

export type NoticeDraft = {
  title: string;
  body: string;
  audience: NoticeAudience[];
  urgent: boolean;
  expiresOn: string | null;
};

/** Tidies what was typed and says what is wrong with it, if anything. */
export function checkNotice(
  raw: { title?: unknown; body?: unknown; audience?: unknown; urgent?: unknown; expiresOn?: unknown },
  role: string,
  today: string,
): { ok: true; notice: NoticeDraft } | { ok: false; error: string } {
  const title = typeof raw.title === "string" ? raw.title.trim().replace(/\s+/g, " ") : "";
  const body = typeof raw.body === "string" ? raw.body.trim().replace(/\n{3,}/g, "\n\n") : "";
  if (!title) return { ok: false, error: "Give the notice a heading." };
  if (title.length > NOTICE_TITLE_MAX)
    return { ok: false, error: `Keep the heading under ${NOTICE_TITLE_MAX} letters.` };
  if (!body) return { ok: false, error: "Write what the notice says." };
  if (body.length > NOTICE_BODY_MAX) return { ok: false, error: `Keep the notice under ${NOTICE_BODY_MAX} letters.` };

  const allowed = audiencesFor(role);
  const picked = Array.isArray(raw.audience) ? raw.audience.filter((a): a is string => typeof a === "string") : [];
  const audience = allowed.filter((a) => picked.includes(a));
  if (!audience.length) return { ok: false, error: "Choose who the notice is for." };
  if (picked.some((a) => !allowed.includes(a as NoticeAudience)))
    return { ok: false, error: "You cannot post a notice to that group." };

  let expiresOn: string | null = null;
  if (raw.expiresOn !== undefined && raw.expiresOn !== null && raw.expiresOn !== "") {
    if (typeof raw.expiresOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw.expiresOn))
      return { ok: false, error: "Which is the last day to show it?" };
    const d = new Date(`${raw.expiresOn}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw.expiresOn)
      return { ok: false, error: "Which is the last day to show it?" };
    if (raw.expiresOn < today) return { ok: false, error: "The last day cannot be in the past." };
    const limit = new Date(`${today}T00:00:00.000Z`);
    limit.setUTCDate(limit.getUTCDate() + NOTICE_MAX_DAYS);
    if (d > limit) return { ok: false, error: `A notice can stay up for at most ${NOTICE_MAX_DAYS} days.` };
    expiresOn = raw.expiresOn;
  }
  return { ok: true, notice: { title, body, audience, urgent: raw.urgent === true, expiresOn } };
}

/** What a reader's home screen shows. */
export type NoticeView = {
  id: string;
  title: string;
  body: string;
  urgent: boolean;
  expiresOn: string | null;
  createdAt: string;
  createdByName: string;
};
