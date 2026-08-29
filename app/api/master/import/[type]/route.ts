import { apiUser, apiPermission } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { importEmployees, importRetailers } from "@/lib/master-import";
import { validateUploadFile, validateUploadContent } from "@/lib/upload-safety";
import { RATE_LIMITS, consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { importValidationError } from "@/lib/http-errors";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest, context: { params: Promise<{ type: string }> }) {
  const actor = await apiUser(["ADMIN", "IT"]);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limit = await consumeRateLimit(RATE_LIMITS.upload, actor.id);
  if (!limit.allowed) {
    const r = rateLimitResponse(limit.retryAfterSeconds);
    return NextResponse.json(r.body, r.init);
  }
  try {
    const { type } = await context.params;
    const normalizedType = type.toLowerCase();
    const permissionModule = normalizedType === "retailers" ? "retailers" : "employees";
    if (!(await apiPermission(permissionModule, "add")))
      return NextResponse.json({ error: "You do not have permission to import this master data." }, { status: 403 });
    if (!new Set(["employees", "retailers"]).has(normalizedType)) {
      return NextResponse.json({ error: "Unsupported master import type" }, { status: 400 });
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Excel file is required" }, { status: 400 });
    }
    const fileError = validateUploadFile(file, [".xlsx", ".xls", ".xlsm"]);
    if (fileError) return NextResponse.json({ error: fileError }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const contentError = validateUploadContent(file.name, buffer);
    if (contentError) return NextResponse.json({ error: contentError }, { status: 400 });
    const result =
      normalizedType === "employees"
        ? await importEmployees(buffer, file.name, actor)
        : await importRetailers(buffer, file.name, actor);

    return NextResponse.json({ ok: true, type: normalizedType, fileName: file.name, ...result });
  } catch (error) {
    console.error(error);
    const e = importValidationError(error, "The master workbook could not be validated.");
    return NextResponse.json({ error: e.error }, { status: e.status });
  }
}
