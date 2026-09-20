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
    /*
     * The CURRENT snapshot means the rows on the latest date, not every row in
     * the table.
     *
     * `importOb` deletes the whole table before writing, so in a clean life
     * there is only ever one date and this filter costs nothing. It is here
     * because the table is not guaranteed to be clean: a restore, a seed, a
     * transaction that did not finish, and the snapshot has two dates in it.
     *
     * That is not hypothetical. The development database holds 2,730 rows
     * across 21 dates for 1,970 outlets, and this endpoint was counting and
     * summing all of them — so the page reported "2,730 retailers" for 1,930
     * real ones and a total balance of ৳9,460,105 where the latest snapshot is
     * ৳9,168,905. Twenty old partial days were being added to today's.
     *
     * A figure headed "Current Balance Snapshot" that is twenty-one snapshots
     * added together is exactly the failure this project keeps auditing for:
     * output that looks correct and is not. `lib/drilldown.ts` already read
     * this correctly, one retailer at a time, with `orderBy: { date: "desc" }`.
     */
    const latest = await prisma.obRecord.aggregate({ _max: { date: true } });
    const snapshot = latest._max.date;
    const current = snapshot ? { date: snapshot } : { id: "none" };
    const [rows, batch, retailerCount, aggregate, ownership] = await Promise.all([
      prisma.obRecord.findMany({
        where: current,
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
      prisma.obRecord.count({ where: current }),
      prisma.obRecord.aggregate({ where: current, _sum: { amount: true } }),
      /*
       * The roll-ups have to come from here, not from the page.
       *
       * The retailer table is server-paged at fifty rows, so the browser never
       * holds more than a fiftieth of the snapshot — an RSO total computed
       * from what is on screen would be the total of one page, which looks
       * like a number and is not one. Every record is read once, with only
       * the amount and the owning employee, and grouped on the server.
       *
       * It is one pass over roughly as many rows as there are retailers
       * (2,190 here), selecting two columns and two joins. The alternative,
       * `groupBy retailerId`, returns just as many groups and still needs the
       * employee lookup afterwards.
       */
      prisma.obRecord.findMany({
        where: current,
        select: {
          amount: true,
          retailer: {
            select: {
              employee: {
                select: {
                  id: true,
                  name: true,
                  rsoMsisdn: true,
                  supervisor: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      }),
    ]);
    /*
     * A retailer has one owning employee and an employee one supervisor, so
     * these are plain sums — see lib/ops-rollup.ts for why that is safe here
     * and is NOT safe on the performance screens, where a Business Partner's
     * outlet is credited to its holder.
     *
     * Grouped on the id, with the name carried along only as a label: two
     * supervisors can share a name, and a name-keyed roll-up merges their
     * teams into one row without saying so (the defect v181 found in the
     * Reporting Center).
     */
    const employeeGroups = new Map<
      string,
      {
        key: string;
        name: string;
        sub: string;
        supervisorId: string;
        supervisor: string;
        count: number;
        amount: number;
      }
    >();
    for (const record of ownership) {
      const employee = record.retailer.employee;
      const key = employee?.id || "unassigned";
      let group = employeeGroups.get(key);
      if (!group)
        employeeGroups.set(
          key,
          (group = {
            key,
            name: employee?.name || "Unassigned",
            sub: employee?.rsoMsisdn || "",
            supervisorId: employee?.supervisor?.id || "unassigned",
            supervisor: employee?.supervisor?.name || "Unassigned",
            count: 0,
            amount: 0,
          }),
        );
      group.count += 1;
      group.amount += Number(record.amount) || 0;
    }
    const byEmployee = [...employeeGroups.values()].sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));

    const supervisorGroups = new Map<
      string,
      { key: string; name: string; rsos: number; count: number; amount: number }
    >();
    for (const employee of byEmployee) {
      let group = supervisorGroups.get(employee.supervisorId);
      if (!group)
        supervisorGroups.set(
          employee.supervisorId,
          (group = { key: employee.supervisorId, name: employee.supervisor, rsos: 0, count: 0, amount: 0 }),
        );
      group.rsos += 1;
      group.count += employee.count;
      group.amount += employee.amount;
    }
    const bySupervisor = [...supervisorGroups.values()].sort(
      (a, b) => b.amount - a.amount || a.name.localeCompare(b.name),
    );
    const total = Number(aggregate._sum.amount || 0);
    const totalPages = Math.max(1, Math.ceil(retailerCount / pageSize));
    return NextResponse.json({
      // The date the DATA carries, not the batch's, when the two disagree:
      // the table is what the page is describing.
      snapshotDate: snapshot?.toISOString().slice(0, 10) ?? batch?.businessDate?.toISOString().slice(0, 10) ?? null,
      totalOpeningBalance: total,
      retailerCount,
      batch,
      byEmployee,
      bySupervisor,
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
