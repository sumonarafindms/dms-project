import { requireUser } from "../../lib/auth";
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireUser(["BP"]);
  return <>{children}</>;
}
