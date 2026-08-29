import { Card, Skeleton } from "../components/Kit";

/** Matches the shape of app/bp/page.tsx so the layout does not jump on load. */
export default function Loading() {
  return (
    <main className="page">
      <Card className="kit-hero-ring">
        <Skeleton className="kit-skel-ring" />
        <Skeleton className="kit-skel-line" />
      </Card>
      <div className="kit-pair kit-my-16">
        {[1, 2].map((i) => (
          <Card key={i} padded>
            <Skeleton className="kit-skel-num" />
          </Card>
        ))}
      </div>
      <Card padded>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="kit-skel-row" />
        ))}
      </Card>
    </main>
  );
}
