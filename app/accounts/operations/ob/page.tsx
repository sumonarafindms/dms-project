import { requirePagePermission } from "../../../../lib/auth";
import OperationPage from "../../../ob/page";
export default async function Page() {
  await requirePagePermission(["ACCOUNTS"], "ob");
  return <OperationPage />;
}
