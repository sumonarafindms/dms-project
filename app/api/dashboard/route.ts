import { apiUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { getEmployeeMonthlyKpis } from "@/lib/kpi";
import { isYm } from "@/lib/business-time";

export async function GET(req: NextRequest) {
  if (!(await apiUser(["ADMIN", "IT"]))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const employeeId = req.nextUrl.searchParams.get("employeeId");
  const month = req.nextUrl.searchParams.get("month");

  if (!employeeId || !isYm(month)) {
    return NextResponse.json({ error: "employeeId and a month (YYYY-MM) are required" }, { status: 400 });
  }

  const data = await getEmployeeMonthlyKpis(employeeId, month);
  return NextResponse.json(data);
}
