/** v205: the Leaderboard's shapes, Prisma-free so the board's screen (a client component) can name them. */

export type BoardPeriod = "month" | "last" | "day";
export const BOARD_PERIODS: { key: BoardPeriod; label: string }[] = [
  { key: "month", label: "This month" },
  { key: "day", label: "Latest day" },
  { key: "last", label: "Last month" },
];

export type BoardRow = {
  id: string;
  name: string;
  sub: string;
  ga: number;
  ga170: number;
  ga300: number;
  target: number | null;
  pct: number | null;
  mine: boolean;
  myTeam: boolean;
};

export type Board = {
  period: BoardPeriod;
  label: string;
  from: string;
  to: string;
  rsos: BoardRow[];
  bps: BoardRow[];
  teams: BoardRow[];
};
