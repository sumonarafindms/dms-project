import Link from "next/link";
import { Card, EmptyState } from "./components/Kit";
import { Icon } from "./components/icons";

/** 404 — same kit empty state as the error boundary. */
export default function NotFound() {
  return (
    <main className="page">
      <Card padded="lg">
        <EmptyState
          title="This DMS page doesn’t exist."
          hint="The link may be outdated, or your role may use a different workspace."
          icon={<Icon name="search" />}
        />
        <div className="kit-form-actions" style={{ justifyContent: "center" }}>
          <Link className="kit-btn is-primary size-md" href="/">
            Go to home
          </Link>
          <Link className="kit-btn is-ghost size-md" href="/login">
            Sign in
          </Link>
        </div>
      </Card>
    </main>
  );
}
