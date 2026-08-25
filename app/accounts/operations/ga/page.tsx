import {requirePagePermission} from "../../../../lib/auth";
import OperationPage from "../../../ga/page";
export default async function Page(){
 await requirePagePermission(["ACCOUNTS"],"ga");
 return <OperationPage/>;
}
