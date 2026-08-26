import {redirect} from "next/navigation";
import {requirePagePermission} from "../../../lib/auth";

export default async function Page(){
 await requirePagePermission(["ADMIN","IT"],"performance");
 redirect("/admin/performance/rsos");
}
