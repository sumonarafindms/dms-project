import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
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
    }),
  ]);

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
  });
}
