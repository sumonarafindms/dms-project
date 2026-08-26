import {apiUser,apiPermission} from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { importEmployees, importRetailers } from "@/lib/master-import";
import {validateUploadFile} from "@/lib/upload-safety";
import {importValidationError} from "@/lib/http-errors";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest, context: { params: Promise<{ type: string }> }) {
  if(!(await apiUser(["ADMIN","IT"]))) return NextResponse.json({error:"Unauthorized"},{status:401});
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
    const fileError=validateUploadFile(file,[".xlsx",".xls",".xlsm"]);
    if(fileError)return NextResponse.json({error:fileError},{status:400});

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = normalizedType === "employees"
      ? await importEmployees(buffer, file.name)
      : await importRetailers(buffer, file.name);

    return NextResponse.json({ ok: true, type: normalizedType, fileName: file.name, ...result });
  } catch (error) {
    console.error(error);
    const e=importValidationError(error,"The master workbook could not be validated.");
    return NextResponse.json({error:e.error},{status:e.status});
  }
}
