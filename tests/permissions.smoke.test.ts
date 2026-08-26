import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
vi.mock("../lib/prisma", () => ({ prisma: { userPermission: { findUnique } } }));

describe("permissions smoke", () => {
  beforeEach(() => findUnique.mockReset());

  it("blocks a role from a module outside its defaults", async () => {
    findUnique.mockResolvedValue(null);
    const { hasPermission } = await import("../lib/permissions");
    await expect(hasPermission("u1", "RSO", "targets", "view")).resolves.toBe(false);
  });

  it("honors an explicit user permission override", async () => {
    findUnique.mockResolvedValue({ canView: true, canAdd: false, canEdit: false, canUpdate: false });
    const { hasPermission } = await import("../lib/permissions");
    await expect(hasPermission("u1", "RSO", "targets", "view")).resolves.toBe(true);
  });
});
