import { apiUser, apiPermission } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/http-errors";

function pagination(req: Request) {
  const url = new URL(req.url);
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("pageSize") || "50", 10) || 50));
  return { page, pageSize, skip: (page - 1) * pageSize };
}

export async function GET(req: Request) {
  if (!(await apiUser(["ADMIN", "IT", "ACCOUNTS"])))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await apiPermission("ob", "view"))) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  try {
    const { page, pageSize, skip } = pagination(req);
    const [rows, batch, retailerCount, aggregate] = await Promise.all([
      prisma.obRecord.findMany({
        select: {
          amount: true,
          date: true,
          retailer: {
            select: {
              retailerCode: true,
              retailerName: true,
              employee: { select: { name: true, rsoMsisdn: true, supervisor: { select: { name: true } } } },
            },
          },
        },
        orderBy: { amount: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.importBatch.findFirst({
        where: { type: "OB" },
        orderBy: { uploadedAt: "desc" },
        select: {
          id: true,
          fileName: true,
          uploadedAt: true,
          businessDate: true,
          totalRows: true,
          successRows: true,
          failedRows: true,
          status: true,
        },
      }),
      prisma.obRecord.count(),
      prisma.obRecord.aggregate({ _sum: { amount: true } }),
    ]);
    const total = Number(aggregate._sum.amount || 0);
    const totalPages = Math.max(1, Math.ceil(retailerCount / pageSize));
    return NextResponse.json({
      snapshotDate: batch?.businessDate?.toISOString().slice(0, 10) ?? rows[0]?.date.toISOString().slice(0, 10) ?? null,
      totalOpeningBalance: total,
      retailerCount,
      batch,
      rows: rows.map((r) => ({
        retailerCode: r.retailer.retailerCode,
        retailerName: r.retailer.retailerName || "",
        employee: r.retailer.employee?.name || "Unassigned",
        rsoMsisdn: r.retailer.employee?.rsoMsisdn || "",
        supervisor: r.retailer.employee?.supervisor?.name || "Unassigned",
        amount: Number(r.amount),
      })),
      pagination: {
        page,
        pageSize,
        total: retailerCount,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
    });
  } catch (error) {
    console.error(error);
    const e = apiError(error, "Failed to load Opening Balance.");
    return NextResponse.json({ error: e.error }, { status: e.status });
  }
}
