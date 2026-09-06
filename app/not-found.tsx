import { Card, EmptyState, LinkBtn } from "./components/Kit";
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
        <div className="kit-form-actions is-center">
          <LinkBtn href="/">Go to home</LinkBtn>
          <LinkBtn variant="ghost" href="/login">
            Sign in
          </LinkBtn>
        </div>
      </Card>
    </main>
  );
}
