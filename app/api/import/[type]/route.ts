import { NextRequest, NextResponse } from "next/server";

const allowed = new Set(["GA", "C2C", "C2S", "OB"]);

export async function POST(req: NextRequest, context: { params: Promise<{ type: string }> }) {
  const { type } = await context.params;
  const normalizedType = type.toUpperCase();

  if (!allowed.has(normalizedType)) {
    return NextResponse.json({ error: "Unsupported import type" }, { status: 400 });
  }

  const form = await req.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Excel file is required" }, { status: 400 });
  }

  // Parser/mapping is intentionally isolated here. The exact workbook column mapping
  // will be implemented after each daily source file is verified against the current Excel logic.
  return NextResponse.json({
    status: "ready-for-mapping",
    type: normalizedType,
    fileName: file.name,
    message: "Upload endpoint is ready. Exact source-column mapping is the next implementation step."
  });
}
