/**
 * v205 — the Leaderboard. Everyone in the field sees the same company board;
 * their own row and their own team are marked. See lib/leaderboard.ts.
 */

import { requireUser } from "../../lib/auth";
import { fmtDate } from "../../lib/format";
import { BOARD_PERIODS, leaderboard, type BoardPeriod } from "../../lib/leaderboard";
import { LinkBtn, PageHeader } from "../components/Kit";
import { LeaderboardView } from "../components/LeaderboardView";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const u = await requireUser(["ADMIN", "IT", "MANAGER", "SUPERVISOR", "RSO", "BP"]);
  const sp = await searchParams;
  const period: BoardPeriod = BOARD_PERIODS.some((p) => p.key === sp.period) ? (sp.period as BoardPeriod) : "month";
  const board = await leaderboard(u, period);

  return (
    <main className="page">
      <PageHeader
        title="Leaderboard"
        subtitle={`Standard GA, 170 and 300 together · ${
          board.from === board.to ? fmtDate(board.from) : `${fmtDate(board.from)} – ${fmtDate(board.to)}`
        }`}
      />
      <nav className="lb-periods" aria-label="Which period">
        {BOARD_PERIODS.map((p) => (
          <LinkBtn
            key={p.key}
            href={`/leaderboard?period=${p.key}`}
            size="sm"
            variant={p.key === period ? "primary" : "secondary"}
            aria-current={p.key === period ? "page" : undefined}
          >
            {p.label}
          </LinkBtn>
        ))}
      </nav>
      <LeaderboardView board={board} viewerRole={u.role} />
    </main>
  );
}
