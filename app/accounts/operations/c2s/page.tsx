import { requirePagePermission } from "../../../../lib/auth";
import OperationPage from "../../../c2s/page";
export default async function Page() {
  await requirePagePermission(["ACCOUNTS"], "c2s");
  return <OperationPage />;
}
