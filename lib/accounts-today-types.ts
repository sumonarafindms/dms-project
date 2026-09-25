/** v206 — the Accounts "today" list's shapes, safe for a client component. */

export type TodayTask = {
  key: string;
  /** bad: a figure is wrong or blocked; warn: work waiting; info: worth a look. */
  tone: "bad" | "warn" | "info";
  title: string;
  detail: string;
  href: string;
  cta: string;
  count?: number;
};

export type TodayList = { today: string; yesterday: string; tasks: TodayTask[]; done: string[] };
