"use client";

/**
 * v205 — the Leaderboard's screen. Data comes whole from lib/leaderboard.ts;
 * this only switches boards and draws them.
 */

import { useState } from "react";
import type { Board, BoardRow } from "@/lib/leaderboard-types";
import { Card, EmptyState } from "./Kit";
import { Icon } from "./icons";

type Which = "rsos" | "bps" | "teams";
const WHICH: { key: Which; label: string }[] = [
  { key: "rsos", label: "RSOs" },
  { key: "bps", label: "BPs" },
  { key: "teams", label: "Teams" },
];

const n = (v: number) => v.toLocaleString("en-US");

function Split({ r }: { r: BoardRow }) {
  return (
    <span className="lb-split">
      300 · {n(r.ga300)} &nbsp; 170 · {n(r.ga170)}
    </span>
  );
}

function Meter({ r }: { r: BoardRow }) {
  // Null on a one-day board (no monthly target applies) — and on a team where
  // not every RSO has a target, which would make the % meaningless.
  if (r.pct === null) return <span className="lb-notarget">{r.target === null ? "No target set" : ""}</span>;
  const w = Math.max(2, Math.min(100, r.pct));
  return (
    <span className="lb-meter" title={`${n(r.ga)} of ${n(r.target ?? 0)} target`}>
      <span className={`lb-meter-bar${r.pct >= 100 ? " is-done" : ""}`} style={{ width: `${w}%` }} />
      <em>{r.pct}%</em>
    </span>
  );
}

export function LeaderboardView({ board, viewerRole }: { board: Board; viewerRole: string }) {
  const [which, setWhich] = useState<Which>(
    viewerRole === "BP" ? "bps" : viewerRole === "SUPERVISOR" || viewerRole === "MANAGER" ? "teams" : "rsos",
  );
  const rows = board[which];
  // A monthly target means nothing against one day's GA — no meter, no "No target" either.
  // …and when nobody on this board has a target, a "No target set" on every
  // row is noise, not information.
  const showMeter = board.period !== "day" && rows.some((r) => r.target !== null);
  const top = rows.slice(0, 3);
  const myIndex = rows.findIndex((r) => r.mine);
  const me = myIndex >= 0 ? rows[myIndex] : null;
  const ahead = myIndex > 0 ? rows[myIndex - 1] : null;

  return (
    <>
      <div className="ops-level-tabs lb-tabs" role="tablist" aria-label="Which board">
        {WHICH.map((w) => (
          <button
            key={w.key}
            type="button"
            role="tab"
            aria-selected={which === w.key}
            className={`ops-level-tab${which === w.key ? " is-active" : ""}`}
            onClick={() => setWhich(w.key)}
          >
            <span>{w.label}</span>
            <em>{n(board[w.key].length)}</em>
          </button>
        ))}
      </div>

      {me ? (
        <Card className="kit-card-p lb-you">
          <span className="lb-you-rank">#{myIndex + 1}</span>
          <div>
            <strong>
              {which === "teams" ? "Your team is" : "You are"} #{myIndex + 1} of {n(rows.length)} with {n(me.ga)} GA
            </strong>
            <p>
              {ahead
                ? `${n(ahead.ga - me.ga + 1)} more GA takes you past #${myIndex} (${ahead.name}).`
                : which === "teams"
                  ? "Your team is on top — keep it there."
                  : "You are on top — keep it there."}
            </p>
          </div>
        </Card>
      ) : null}

      {rows.length ? (
        <>
          <div className="lb-podium">
            {top.map((r, i) => (
              <div
                key={r.id}
                className={`lb-podium-card is-${i + 1}${r.mine ? " is-mine" : r.myTeam ? " is-team" : ""}`}
              >
                <span className="lb-medal" aria-label={`Rank ${i + 1}`}>
                  {i + 1}
                </span>
                <strong className="lb-podium-name">{r.name}</strong>
                {r.mine ? (
                  <em className="lb-tag">{which === "teams" ? "Your team" : "You"}</em>
                ) : r.myTeam ? (
                  <em className="lb-tag is-team">Your team</em>
                ) : null}
                <span className="lb-podium-sub">{r.sub}</span>
                <span className="lb-podium-ga">
                  {n(r.ga)} <small>GA</small>
                </span>
                <Split r={r} />
                {showMeter ? <Meter r={r} /> : null}
              </div>
            ))}
          </div>

          <ol className={`lb-list${showMeter ? "" : " is-bare"}`} start={4}>
            {rows.slice(3).map((r, i) => (
              <li key={r.id} className={`lb-row${r.mine ? " is-mine" : r.myTeam ? " is-team" : ""}`}>
                <span className="lb-rank">{i + 4}</span>
                <span className="lb-who">
                  <strong>
                    {r.name}
                    {r.mine ? (
                      <em className="lb-tag">{which === "teams" ? "Your team" : "You"}</em>
                    ) : r.myTeam ? (
                      <em className="lb-tag is-team">Your team</em>
                    ) : null}
                  </strong>
                  <span>{r.sub}</span>
                </span>
                <span className="lb-ga">
                  <strong>{n(r.ga)}</strong>
                  <Split r={r} />
                </span>
                {showMeter ? <Meter r={r} /> : null}
              </li>
            ))}
          </ol>
        </>
      ) : (
        <Card padded>
          <EmptyState
            title="No GA in this period yet"
            hint="The board fills in as soon as the GA file for these days is uploaded."
            icon={<Icon name="chart" />}
          />
        </Card>
      )}
    </>
  );
}
