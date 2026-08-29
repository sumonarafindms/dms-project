import { apiUser } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function pagination(req: Request) {
  const url = new URL(req.url);
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("pageSize") || "50", 10) || 50));
  return { page, pageSize, skip: (page - 1) * pageSize };
}

export async function GET(req: Request) {
  if (!(await apiUser(["ADMIN", "IT"]))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { page, pageSize, skip } = pagination(req);
  const [supervisors, employees, retailers, mappedRetailers, unassignedRetailers, employeeRows] = await Promise.all([
    prisma.supervisor.count({ where: { active: true } }),
    prisma.employee.count({ where: { active: true } }),
    prisma.retailer.count({ where: { active: true } }),
    prisma.retailer.count({ where: { active: true, employeeId: { not: null } } }),
    prisma.retailer.count({ where: { active: true, employeeId: null } }),
    prisma.employee.findMany({
      where: { active: true },
      select: {
        id: true,
        employeeCode: true,
        rsoMsisdn: true,
        name: true,
        supervisor: { select: { name: true } },
        _count: { select: { retailers: { where: { active: true } } } },
      },
      orderBy: [{ supervisor: { name: "asc" } }, { name: "asc" }],
      skip,
      take: pageSize,
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(employees / pageSize));

  return NextResponse.json({
    supervisors,
    employees,
    retailers,
    mappedRetailers,
    unassignedRetailers,
    employeeRows: employeeRows.map((row) => ({
      id: row.id,
      employeeCode: row.employeeCode,
      rsoMsisdn: row.rsoMsisdn,
      name: row.name,
      supervisor: row.supervisor?.name ?? "Unassigned",
      retailerCount: row._count.retailers,
    })),
    pagination: { page, pageSize, total: employees, totalPages, hasNext: page < totalPages, hasPrevious: page > 1 },
  });
}
