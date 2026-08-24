import { NextRequest, NextResponse } from "next/server";
import { importGaActivationWorkbook } from "@/lib/ga-import";
import { importC2cWorkbook } from "@/lib/c2c-import";
import { importC2sWorkbook } from "@/lib/c2s-import";
import { importObWorkbook } from "@/lib/ob-import";

const allowed = new Set(["GA", "C2C", "C2S", "OB"]);

export async function POST(req: NextRequest, context: { params: Promise<{ type: string }> }) {
  try {
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

    if (normalizedType === "GA") {
      const businessDate = String(form.get("businessDate") || "");
      const result = await importGaActivationWorkbook(
        file.name,
        Buffer.from(await file.arrayBuffer()),
        businessDate,
      );
      return NextResponse.json(result);
    }

    if (normalizedType === "C2C") {
      const result = await importC2cWorkbook(file.name, Buffer.from(await file.arrayBuffer()));
      return NextResponse.json(result);
    }

    if (normalizedType === "C2S") {
      const result = await importC2sWorkbook(file.name, Buffer.from(await file.arrayBuffer()));
      return NextResponse.json(result);
    }

    if (normalizedType === "OB") {
      const result = await importObWorkbook(file.name, Buffer.from(await file.arrayBuffer()));
      return NextResponse.json(result);
    }

    return NextResponse.json({
      status: "ready-for-mapping",
      type: normalizedType,
      fileName: file.name,
      message: `${normalizedType} source-column mapping will be connected in the next phase.`,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Import failed" },
      { status: 500 },
    );
  }
}
