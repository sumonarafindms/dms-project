import {requirePagePermission} from "../../../../lib/auth";
import OperationPage from "../../../c2c/page";
export default async function Page(){
 await requirePagePermission(["ACCOUNTS"],"c2c");
 return <OperationPage/>;
}
