import { apiUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { getEmployeeMonthlyKpis } from "@/lib/kpi";

export async function GET(req: NextRequest) {
  if (!(await apiUser(["ADMIN", "IT"]))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const employeeId = req.nextUrl.searchParams.get("employeeId");
  const month = req.nextUrl.searchParams.get("month");

  if (!employeeId || !month) {
    return NextResponse.json({ error: "employeeId and month are required" }, { status: 400 });
  }

  const data = await getEmployeeMonthlyKpis(employeeId, month);
  return NextResponse.json(data);
}
