/** v203: one Quick search result. Prisma-free, so the search box (a client component) can name it. */
export type QuickHit = {
  kind: "RSO" | "Supervisor" | "BP" | "Outlet";
  title: string;
  sub: string;
  href: string;
};
