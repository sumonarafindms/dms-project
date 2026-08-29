import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Assignment history: the record that lets a July report still say "RSO Karim"
 * after the retailer has moved to Rahim in August.
 */

type Row = Record<string, unknown>;
const written: Row[] = [];
let failNext = false;

vi.mock("../lib/prisma", () => ({
  prisma: {
    auditLog: {
      createMany: async ({ data }: { data: Row[] }) => {
        if (failNext) throw new Error("connection refused");
        written.push(...data);
        return { count: data.length };
      },
    },
  },
}));

const { ASSIGNMENT_MODULE, describeChange, isRealChange, recordAssignmentChanges } =
  await import("../lib/assignment-history");

const actor = { id: "u1", displayName: "Nasrin", role: "ADMIN" };
const move = (over: Partial<Parameters<typeof describeChange>[0]> = {}) => ({
  kind: "RETAILER_RSO" as const,
  entityId: "RT-102",
  entityName: "RT-102 — Rahim Store",
  fromId: "emp-karim",
  fromName: "Karim",
  toId: "emp-rahim",
  toName: "Rahim",
  ...over,
});

beforeEach(() => {
  written.length = 0;
  failNext = false;
});

describe("what counts as a change", () => {
  it("ignores a no-op", () => {
    // A team editor re-saved without edits must not fill the log with noise.
    expect(isRealChange(move({ fromId: "emp-a", toId: "emp-a" }))).toBe(false);
    expect(isRealChange(move({ fromId: null, toId: null }))).toBe(false);
  });

  it("counts a move, a first assignment and a removal", () => {
    expect(isRealChange(move())).toBe(true);
    expect(isRealChange(move({ fromId: null, fromName: null }))).toBe(true);
    expect(isRealChange(move({ toId: null, toName: null }))).toBe(true);
  });
});

describe("recording", () => {
  it("writes one row per real change, and none for no-ops", async () => {
    const n = await recordAssignmentChanges(actor, [
      move(),
      move({ entityId: "RT-103", fromId: "emp-a", toId: "emp-a" }),
      move({ entityId: "RT-104", fromId: null, fromName: null }),
    ]);
    expect(n).toBe(2);
    expect(written.map((r) => r.targetId)).toEqual(["RT-102", "RT-104"]);
  });

  it("keeps BOTH the old and the new owner", async () => {
    // This is the whole point. Before this existed, master-import overwrote
    // `employeeId` and the previous RSO was unrecoverable.
    await recordAssignmentChanges(actor, [move()], "retailer master: aug.xlsx");
    const meta = written[0].metadata as Record<string, unknown>;
    expect(meta.fromId).toBe("emp-karim");
    expect(meta.fromName).toBe("Karim");
    expect(meta.toId).toBe("emp-rahim");
    expect(meta.toName).toBe("Rahim");
    expect(meta.source).toBe("retailer master: aug.xlsx");
  });

  it("files it under its own module so the Activity Log can separate it", async () => {
    await recordAssignmentChanges(actor, [move()]);
    expect(written[0].module).toBe(ASSIGNMENT_MODULE);
    expect(written[0].action).toBe("REASSIGN_RETAILER_RSO");
    expect(written[0].targetType).toBe("Retailer");
  });

  it("attributes the change to whoever made it, and to System when unattended", async () => {
    await recordAssignmentChanges(actor, [move()]);
    expect(written[0].actorName).toBe("Nasrin");
    written.length = 0;
    await recordAssignmentChanges(null, [move()]);
    expect(written[0].actorName).toBe("System");
    expect(written[0].actorRole).toBe("SYSTEM");
  });

  it("chunks a bulk upload rather than one enormous insert", async () => {
    // A first retailer master upload assigns thousands of retailers at once.
    const many = Array.from({ length: 1200 }, (_, i) => move({ entityId: `RT-${i}`, fromId: `a${i}`, toId: `b${i}` }));
    expect(await recordAssignmentChanges(actor, many)).toBe(1200);
    expect(written).toHaveLength(1200);
  });

  it("never throws when the database refuses", async () => {
    // Losing history is bad; failing a valid import because history could not
    // be written is worse. The failure is logged, not raised.
    failNext = true;
    await expect(recordAssignmentChanges(actor, [move()])).resolves.toBe(0);
  });
});

describe("the human-readable line", () => {
  it("reads as a sentence for each shape", () => {
    expect(describeChange(move())).toBe("Retailer RT-102 — Rahim Store: RSO changed from Karim to Rahim");
    expect(describeChange(move({ fromId: null, fromName: null }))).toBe(
      "Retailer RT-102 — Rahim Store: RSO set to Rahim",
    );
    expect(describeChange(move({ toId: null, toName: null }))).toBe(
      "Retailer RT-102 — Rahim Store: removed from RSO Karim",
    );
  });

  it("names the right relationship for each kind", () => {
    expect(describeChange(move({ kind: "RSO_SUPERVISOR", entityName: "R-9 — Karim" }))).toContain(
      "RSO R-9 — Karim: Supervisor changed",
    );
    expect(describeChange(move({ kind: "SUPERVISOR_MANAGER", entityName: "Nurjahan" }))).toContain(
      "Supervisor Nurjahan: Manager changed",
    );
  });
});
