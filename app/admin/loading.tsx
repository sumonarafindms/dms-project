import { Card, Skeleton } from "../components/Kit";

/**
 * Route skeleton for every /admin/* page.
 *
 * The previous version used four `route-loading-*-v89` classes that no
 * stylesheet ever defined — the divs were empty and zero-height, so every
 * admin navigation showed a blank page instead of a skeleton. This is the
 * same shape the other role sections already use: a header line, then a
 * grid of cards.
 */
export default function Loading() {
  return (
    <main className="page" aria-live="polite" aria-busy="true">
      <div className="kit-loading-bar" aria-hidden="true">
        <i />
      </div>
      <div className="kit-page-head">
        <div>
          <Skeleton className="kit-skel-num" />
          <Skeleton className="kit-skel-line" />
        </div>
      </div>
      <div className="kit-summary-strip">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} padded>
            <Skeleton className="kit-skel-num" />
          </Card>
        ))}
      </div>
      <Card className="kit-mt-20" padded>
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="kit-skel-row" />
        ))}
      </Card>
    </main>
  );
}
