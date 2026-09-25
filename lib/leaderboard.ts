/**
 * v205 — the Leaderboard: who sold the most GA, for motivation.
 *
 * The owner picked it from the "more features" list. Three boards, one rule:
 *
 *   RSOs    their own GA (a BP's SIMs are the BP's, as on every screen — v139)
 *   BPs     each outlet's GA over its assignment window
 *   Teams   a supervisor's RSOs + BPs, the one place the two are added (withBp)
 *
 * Standard GA only, split 170/300, from the same functions every performance
 * screen uses (`employeePerformance`, `listBpAssignments`), so a rank here
 * never disagrees with a figure there.
 *
 * Everyone sees the whole company — a board of one team motivates nobody —
 * but only names, codes, GA and target %: no money, no phone numbers. The
 * viewer's own row, and their own team, are marked.
 *
 * A target is monthly. On the one-day board there is no target and no % —
 * a day's GA against a month's target is not a figure anybody set.
 */

import { prisma } from "./prisma";
import { dhakaMonth } from "./business-time";
import { employeePerformance } from "./performance";
import { listBpAssignments } from "./bp-activations";
import { managerScope } from "./manager-scope";
import { bpDisplayName } from "./bp-name";

import { type Board, type BoardPeriod, type BoardRow } from "./leaderboard-types";
export { BOARD_PERIODS, type Board, type BoardPeriod, type BoardRow } from "./leaderboard-types";

type Viewer = {
  id: string;
  role: string;
  employeeId?: string | null;
  supervisorId?: string | null;
  bpRetailerId?: string | null;
};

const pct = (ga: number, target: number | null) => (target && target > 0 ? Math.round((ga / target) * 100) : null);

function monthEnd(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
function prevMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

/** Rank by GA, then by % of target, then by name — so a tie reads the same way every time. */
function rank(rows: BoardRow[]) {
  return rows
    .filter((r) => r.ga > 0 || r.mine)
    .sort((a, b) => b.ga - a.ga || (b.pct ?? -1) - (a.pct ?? -1) || a.name.localeCompare(b.name));
}

export async function leaderboard(viewer: Viewer, period: BoardPeriod): Promise<Board> {
  const thisMonth = dhakaMonth();
  let month = thisMonth,
    from: string,
    to: string,
    label: string;
  if (period === "last") {
    month = prevMonth(thisMonth);
    from = `${month}-01`;
    to = monthEnd(month);
    label = "Last month";
  } else if (period === "day") {
    // The latest day the GA file covers — the "today" the data actually has.
    const latest = await prisma.gaActivation.aggregate({ _max: { activationDate: true } });
    to = latest._max.activationDate ? latest._max.activationDate.toISOString().slice(0, 10) : `${thisMonth}-01`;
    from = to;
    month = to.slice(0, 7);
    label = "Latest day";
  } else {
    from = `${month}-01`;
    to = monthEnd(month);
    label = "This month";
  }

  const [perf, bpData, myTeams] = await Promise.all([
    employeePerformance(`${month}-01`, undefined, from, to),
    listBpAssignments({ role: "ADMIN" }, month, from, to),
    viewer.role === "MANAGER"
      ? managerScope(viewer.id).then((s) => new Set(s.supervisorIds))
      : Promise.resolve(new Set(viewer.supervisorId ? [viewer.supervisorId] : [])),
  ]);
  const day = period === "day";

  // An RSO's own team is their supervisor's.
  if (viewer.role === "RSO" && viewer.employeeId) {
    const me = perf.find((p) => p.employeeId === viewer.employeeId);
    if (me?.supervisorId) myTeams.add(me.supervisorId);
  }

  const rsos: BoardRow[] = perf.map((p) => {
    const target = day ? null : p.gaTarget || null;
    return {
      id: p.employeeId,
      name: p.name,
      sub: [p.employeeCode, p.supervisor].filter(Boolean).join(" · "),
      ga: p.gaAchieved,
      ga170: p.ga170,
      ga300: p.ga300,
      target,
      pct: pct(p.gaAchieved, target),
      mine: viewer.role === "RSO" && p.employeeId === viewer.employeeId,
      myTeam: !!p.supervisorId && myTeams.has(p.supervisorId),
    };
  });

  // One outlet, one row: an outlet held by two RSOs in the period counts once.
  const byOutlet = new Map<string, BoardRow & { supervisorId?: string | null }>();
  for (const a of bpData.assignments) {
    const supervisorId = a.employee.supervisor?.id ?? null;
    const prev = byOutlet.get(a.retailerId);
    const ga = (prev?.ga ?? 0) + a.monthGa.total;
    const target = day ? null : (prev?.target ?? 0) + (a.gaTarget || 0) || null;
    byOutlet.set(a.retailerId, {
      id: a.id,
      name: bpDisplayName(a.retailer),
      sub: [a.retailer.retailerCode, `RSO ${a.employee.name}`].join(" · "),
      ga,
      ga170: (prev?.ga170 ?? 0) + a.monthGa.ga170,
      ga300: (prev?.ga300 ?? 0) + a.monthGa.ga300,
      target,
      pct: pct(ga, target),
      mine: viewer.role === "BP" && a.retailerId === viewer.bpRetailerId,
      myTeam: !!supervisorId && myTeams.has(supervisorId),
      supervisorId,
    });
  }
  const bps = [...byOutlet.values()];

  // Teams: RSOs + BPs under one supervisor.
  const teams = new Map<string, BoardRow>();
  const team = (id: string | null, name: string) => {
    const key = id ?? "none";
    let t = teams.get(key);
    if (!t) {
      t = {
        id: key,
        name: id ? name : "Unassigned",
        sub: "",
        ga: 0,
        ga170: 0,
        ga300: 0,
        target: day ? null : 0,
        pct: null,
        // A supervisor's own team is "mine" on the Teams board.
        mine: viewer.role === "SUPERVISOR" && !!id && id === viewer.supervisorId,
        myTeam: !!id && myTeams.has(id),
      };
      teams.set(key, t);
    }
    return t;
  };
  const people = new Map<string, number>();
  /*
   * A team's % is shown only when EVERY one of its RSOs has a target. One RSO
   * with a target of 100 in a team of seven made the team "7,966%" — a figure
   * of the team's whole GA against one person's goal.
   */
  const gaps = new Set<string>();
  for (const p of perf) {
    const t = team(p.supervisorId, p.supervisor);
    t.ga += p.gaAchieved;
    t.ga170 += p.ga170;
    t.ga300 += p.ga300;
    if (t.target !== null) t.target += p.gaTarget || 0;
    if (!p.gaTarget) gaps.add(t.id);
    people.set(t.id, (people.get(t.id) ?? 0) + 1);
  }
  for (const b of bps) {
    const t = teams.get(b.supervisorId ?? "none");
    if (!t) continue;
    t.ga += b.ga;
    t.ga170 += b.ga170;
    t.ga300 += b.ga300;
    if (t.target !== null) t.target += b.target || 0;
  }
  for (const t of teams.values()) {
    t.target = gaps.has(t.id) ? null : t.target || null;
    t.pct = pct(t.ga, t.target);
    const n = people.get(t.id) ?? 0;
    t.sub = `${n} RSO${n === 1 ? "" : "s"}`;
  }

  return {
    period,
    label,
    from,
    to,
    rsos: rank(rsos),
    bps: rank(bps),
    teams: rank([...teams.values()]),
  };
}
