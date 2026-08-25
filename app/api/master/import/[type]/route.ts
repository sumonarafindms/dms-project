import {apiUser,apiPermission} from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { importEmployees, importRetailers } from "@/lib/master-import";

export const runtime = "nodejs";

export async function POST(req: NextRequest, context: { params: Promise<{ type: string }> }) {
  if(!(await apiUser(["ADMIN"]))) return NextResponse.json({error:"Unauthorized"},{status:401});
  try {
    const { type } = await context.params;
    const normalizedType = type.toLowerCase();
    const permissionModule=normalizedType==="retailers"?"retailers":"employees";
    if(!(await apiPermission(permissionModule,"add"))) return NextResponse.json({error:"You do not have permission to import this master data."},{status:403});
    if (!new Set(["employees", "retailers"]).has(normalizedType)) {
      return NextResponse.json({ error: "Unsupported master import type" }, { status: 400 });
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Excel file is required" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = normalizedType === "employees"
      ? await importEmployees(buffer, file.name)
      : await importRetailers(buffer, file.name);

    return NextResponse.json({ ok: true, type: normalizedType, fileName: file.name, ...result });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Import failed" },
      { status: 500 },
    );
  }
}
