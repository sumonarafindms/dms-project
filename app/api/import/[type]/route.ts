import {apiUser,apiPermission} from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { importGaActivationWorkbook } from "@/lib/ga-import";
import { importC2cWorkbook } from "@/lib/c2c-import";
import { importC2sWorkbook } from "@/lib/c2s-import";
import { importObWorkbook } from "@/lib/ob-import";
import {audit} from "@/lib/audit";
import {validateUploadFile} from "@/lib/upload-safety";
import {apiError} from "@/lib/http-errors";

export const runtime = "nodejs";
export const maxDuration = 60;

const allowed = new Set(["GA", "C2C", "C2S", "OB"]);

export async function POST(req: NextRequest, context: { params: Promise<{ type: string }> }) {
  const actor=await apiUser(["ADMIN","ACCOUNTS"]);if(!actor) return NextResponse.json({error:"Unauthorized"},{status:401});
  try {
    const { type } = await context.params;
    const normalizedType = type.toUpperCase();
    const module=normalizedType.toLowerCase() as "ga"|"c2c"|"c2s"|"ob";
    if(!(await apiPermission(module,"add"))) return NextResponse.json({error:"You do not have permission to upload this module."},{status:403});

    if (!allowed.has(normalizedType)) {
      return NextResponse.json({ error: "Unsupported import type" }, { status: 400 });
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Excel file is required" }, { status: 400 });
    }
    const fileError=validateUploadFile(file,[".xlsx",".xls",".xlsm",".txt"]);
    if(fileError)return NextResponse.json({error:fileError},{status:400});

    if (normalizedType === "GA") {
      const businessDate = String(form.get("businessDate") || "");
      const result = await importGaActivationWorkbook(
        file.name,
        Buffer.from(await file.arrayBuffer()),
        businessDate,
      );
      await audit(actor,"IMPORT_GA","ga",{targetType:"File",targetName:file.name,detail:"Imported GA workbook"});
      return NextResponse.json(result);
    }

    if (normalizedType === "C2C") {
      const result = await importC2cWorkbook(file.name, Buffer.from(await file.arrayBuffer()));
      await audit(actor,"IMPORT_C2C","c2c",{targetType:"File",targetName:file.name,detail:"Imported C2C workbook"});
      return NextResponse.json(result);
    }

    if (normalizedType === "C2S") {
      const result = await importC2sWorkbook(file.name, Buffer.from(await file.arrayBuffer()));
      await audit(actor,"IMPORT_C2S","c2s",{targetType:"File",targetName:file.name,detail:"Imported C2S workbook"});
      return NextResponse.json(result);
    }

    if (normalizedType === "OB") {
      const result = await importObWorkbook(file.name, Buffer.from(await file.arrayBuffer()));
      await audit(actor,"IMPORT_OB","ob",{targetType:"File",targetName:file.name,detail:"Imported OB workbook"});
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
    const e=apiError(error,"Import failed. Check the file format and try again.");
    return NextResponse.json({error:e.error},{status:e.status});
  }
}
