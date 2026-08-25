import {requirePagePermission} from "../../../../lib/auth";
import OperationPage from "../../../targets/page";
export default async function Page(){
 await requirePagePermission(["ACCOUNTS"],"targets");
 return <OperationPage/>;
}
