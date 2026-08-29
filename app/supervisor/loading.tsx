import { Card, Skeleton } from "../components/Kit";

/** Mirrors app/supervisor/page.tsx so the layout does not jump when data lands. */
export default function Loading() {
  return (
    <main className="page">
      <div className="kit-summary-strip">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} padded>
            <Skeleton className="kit-skel-num" />
          </Card>
        ))}
      </div>
      <div className="kit-kpi-grid">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} padded>
            <Skeleton className="kit-skel-num" />
            <Skeleton className="kit-skel-row" />
          </Card>
        ))}
      </div>
    </main>
  );
}
