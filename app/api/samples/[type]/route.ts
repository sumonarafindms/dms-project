import {NextResponse} from "next/server";
import * as XLSX from "xlsx";
import {apiUser} from "@/lib/auth";

export const runtime="nodejs";

const definitions:Record<string,{name:string;sheet:string;rows:Record<string,unknown>[]}>={
  ga:{
    name:"GA_Sample.xlsx",sheet:"GA Sample",
    rows:[
      {RETAILER_CODE:"R000001",SIM_NO:"899110000000000001",SELLING_PRICE:170,ACTIVATION_DATE:"25-Aug-2026",ACTIVATION_TIME:"10:15:00 AM"},
      {RETAILER_CODE:"R000001",SIM_NO:"899110000000000002",SELLING_PRICE:300,ACTIVATION_DATE:"25-Aug-2026",ACTIVATION_TIME:"11:20:00 AM"},
    ]
  },
  c2c:{
    name:"C2C_Sample.xlsx",sheet:"C2C Sample",
    rows:[
      {RETAILER_CODE:"R000001",RETAILER_ITOPUP_NO:"01700000001",TRANSACTION_COUNT:2,TOTAL_AMOUNT:700,SRNUMBER:"01900000001","01-Aug-2026":300,"02-Aug-2026":400},
      {RETAILER_CODE:"R000002",RETAILER_ITOPUP_NO:"01700000002",TRANSACTION_COUNT:1,TOTAL_AMOUNT:250,SRNUMBER:"01900000001","01-Aug-2026":250,"02-Aug-2026":0},
    ]
  },
  c2s:{
    name:"C2S_Sample.xlsx",sheet:"C2S Sample",
    rows:[
      {RETAILER_CODE:"R000001",RETAILER_ITOPUP_NO:"01700000001",TRANSACTION_COUNT:2,TOTAL_AMOUNT:650,SRNUMBER:"01900000001","01-Aug-2026":300,"02-Aug-2026":350},
      {RETAILER_CODE:"R000002",RETAILER_ITOPUP_NO:"01700000002",TRANSACTION_COUNT:1,TOTAL_AMOUNT:200,SRNUMBER:"01900000001","01-Aug-2026":200,"02-Aug-2026":0},
    ]
  },
  ob:{
    name:"OB_Sample.xlsx",sheet:"OB Sample",
    rows:[
      {RETAILER_CODE:"R000001",RETAILER_ITOPUP_NO:"01700000001",TRANSACTION_COUNT:0,TOTAL_AMOUNT:1200,SRNUMBER:"01900000001","25-Aug-2026":1200},
      {RETAILER_CODE:"R000002",RETAILER_ITOPUP_NO:"01700000002",TRANSACTION_COUNT:0,TOTAL_AMOUNT:850,SRNUMBER:"01900000001","25-Aug-2026":850},
    ]
  },
  retailers:{
    name:"Retailer_List_Sample.xlsx",sheet:"Retailers",
    rows:[
      {RETAILER_CODE:"R000001",RETAILER_NAME:"Sample Retailer",SIM_SELLER:"Y",I_TOP_UP_SELLER:"Y",TRANMOBILENO:"01700000001",I_TOP_UP_SR_NUMBER:"01900000001",I_TOP_UP_NUMBER:"01700000001",CATEGORY:"A",RSOCODE:"RS0001",ROUTE:"Route 1"},
      {RETAILER_CODE:"R000002",RETAILER_NAME:"Second Retailer",SIM_SELLER:"N",I_TOP_UP_SELLER:"Y",TRANMOBILENO:"01700000002",I_TOP_UP_SR_NUMBER:"01900000001",I_TOP_UP_NUMBER:"01700000002",CATEGORY:"B",RSOCODE:"RS0001",ROUTE:"Route 1"},
    ]
  },
  targets:{
    name:"Target_Upload_Sample.xlsx",sheet:"Targets",
    rows:[
      {RSO_NUMBER:"01900000001",BP_CODE:"",TARGET_TYPE:"GA",TARGET:100},
      {RSO_NUMBER:"01900000001",BP_CODE:"",TARGET_TYPE:"C2C",TARGET:50000},
      {RSO_NUMBER:"01900000001",BP_CODE:"",TARGET_TYPE:"SSO",TARGET:25},
      {RSO_NUMBER:"",BP_CODE:"R000001",TARGET_TYPE:"BP_GA",TARGET:80},
    ]
  }
};

export async function GET(_:Request,{params}:{params:Promise<{type:string}>}){
  if(!(await apiUser(["ADMIN","ACCOUNTS"])))return NextResponse.json({error:"Unauthorized"},{status:401});
  const {type}=await params,d=definitions[type.toLowerCase()];
  if(!d)return NextResponse.json({error:"Unsupported sample type"},{status:404});
  const wb=XLSX.utils.book_new(),ws=XLSX.utils.json_to_sheet(d.rows);
  XLSX.utils.book_append_sheet(wb,ws,d.sheet);
  const bytes=XLSX.write(wb,{type:"buffer",bookType:"xlsx"});
  return new NextResponse(new Uint8Array(bytes),{headers:{
    "Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition":`attachment; filename="${d.name}"`,
    "Cache-Control":"no-store"
  }});
}
