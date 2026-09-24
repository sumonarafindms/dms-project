import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { apiUser } from "@/lib/auth";
import { RATE_LIMITS, consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

const definitions: Record<string, { name: string; sheet: string; rows: Record<string, unknown>[] }> = {
  ga: {
    name: "GA_Sample.xlsx",
    sheet: "GA Sample",
    rows: [
      {
        RETAILER_CODE: "R000001",
        SIM_NO: "899110000000000001",
        PRODUCT_CODE: "MMSTC",
        SELLING_PRICE: 170,
        ACTIVATION_DATE: "25-Aug-2026",
        ACTIVATION_TIME: "10:15:00 AM",
      },
      {
        RETAILER_CODE: "R000001",
        SIM_NO: "899110000000000002",
        PRODUCT_CODE: "MMST",
        SELLING_PRICE: 300,
        ACTIVATION_DATE: "25-Aug-2026",
        ACTIVATION_TIME: "11:20:00 AM",
      },
      {
        RETAILER_CODE: "R000001",
        SIM_NO: "899110000000000003",
        PRODUCT_CODE: "SIMWAP",
        // The tariff of the day. It is illustrative only — nothing validates it.
        SELLING_PRICE: 150,
        ACTIVATION_DATE: "25-Aug-2026",
        ACTIVATION_TIME: "12:10:00 PM",
      },
      {
        RETAILER_CODE: "R000002",
        SIM_NO: "899110000000000004",
        PRODUCT_CODE: "EV-SWAP",
        // Deliberately a different number from the SIMWAP row above: the two
        // swaps are the same kind of row whatever they cost. This sample used
        // to say 350 here while the importer demanded 100, so the file the app
        // handed out as an example was one the app itself would have rejected.
        SELLING_PRICE: 100,
        ACTIVATION_DATE: "25-Aug-2026",
        ACTIVATION_TIME: "01:20:00 PM",
      },
    ],
  },
  c2c: {
    name: "C2C_Sample.xlsx",
    sheet: "C2C Sample",
    rows: [
      {
        RETAILER_CODE: "R000001",
        RETAILER_ITOPUP_NO: "01700000001",
        TRANSACTION_COUNT: 4,
        TOTAL_AMOUNT: 700,
        SRNUMBER: "01900000001",
        "01-Aug-2026": 300,
        "02-Aug-2026": 400,
      },
      {
        RETAILER_CODE: "R000002",
        RETAILER_ITOPUP_NO: "01700000002",
        TRANSACTION_COUNT: 1,
        TOTAL_AMOUNT: 250,
        SRNUMBER: "01900000001",
        "01-Aug-2026": 250,
        "02-Aug-2026": 0,
      },
    ],
  },
  c2s: {
    name: "C2S_Sample.xlsx",
    sheet: "C2S Sample",
    rows: [
      {
        RETAILER_CODE: "R000001",
        RETAILER_ITOPUP_NO: "01700000001",
        TRANSACTION_COUNT: 7,
        TOTAL_AMOUNT: 650,
        SRNUMBER: "01900000001",
        "01-Aug-2026": 300,
        "02-Aug-2026": 350,
      },
      {
        RETAILER_CODE: "R000002",
        RETAILER_ITOPUP_NO: "01700000002",
        TRANSACTION_COUNT: 1,
        TOTAL_AMOUNT: 200,
        SRNUMBER: "01900000001",
        "01-Aug-2026": 200,
        "02-Aug-2026": 0,
      },
    ],
  },
  ob: {
    name: "OB_Sample.xlsx",
    sheet: "OB Sample",
    rows: [
      {
        RETAILER_CODE: "R000001",
        RETAILER_ITOPUP_NO: "01700000001",
        TRANSACTION_COUNT: 0,
        TOTAL_AMOUNT: 1200,
        SRNUMBER: "01900000001",
        "25-Aug-2026": 1200,
      },
      {
        RETAILER_CODE: "R000002",
        RETAILER_ITOPUP_NO: "01700000002",
        TRANSACTION_COUNT: 0,
        TOTAL_AMOUNT: 850,
        SRNUMBER: "01900000001",
        "25-Aug-2026": 850,
      },
    ],
  },
  retailers: {
    name: "Retailer_List_Sample.xlsx",
    sheet: "Retailers",
    rows: [
      {
        RETAILER_CODE: "R000001",
        RETAILER_NAME: "Sample Retailer",
        SIM_SELLER: "Y",
        I_TOP_UP_SELLER: "Y",
        TRANMOBILENO: "01700000001",
        I_TOP_UP_SR_NUMBER: "01900000001",
        I_TOP_UP_NUMBER: "01700000001",
        CATEGORY: "A",
        RSOCODE: "RS0001",
        ROUTE: "Route 1",
      },
      {
        RETAILER_CODE: "R000002",
        RETAILER_NAME: "Second Retailer",
        SIM_SELLER: "N",
        I_TOP_UP_SELLER: "Y",
        TRANMOBILENO: "01700000002",
        I_TOP_UP_SR_NUMBER: "01900000001",
        I_TOP_UP_NUMBER: "01700000002",
        CATEGORY: "B",
        RSOCODE: "RS0001",
        ROUTE: "Route 1",
      },
    ],
  },
  /*
   * One row per person, six columns, in the order the owner asked for.
   *
   * The previous sheet was one row per TARGET: four columns
   * (RSO_NUMBER, BP_CODE, TARGET_TYPE, TARGET) and six rows to give one RSO
   * six numbers. Setting targets for forty RSOs meant two hundred and forty
   * rows, none of which could be pasted from anything — every value needed its
   * own label typed beside it.
   *
   * Now each row is a person and each column a metric, which is the shape a
   * spreadsheet is already in when you copy a block of numbers out of one.
   *
   * CODE carries whichever identifier that row is: an RSO's mobile number, or
   * a retailer code for a Business Partner. One column rather than two,
   * because a row is one or the other and a blank column beside every value is
   * a column people mis-fill. The importer tells them apart by looking the
   * value up, and says which it matched.
   *
   * A BP's row uses GA only — a Business Partner has no C2C, SC, SSO or LSO
   * target in this system. The columns stay in the sheet so one file shape
   * covers both, and the importer reports any non-zero value it could not
   * store rather than dropping it quietly.
   */
  targets: {
    name: "Target_Upload_Sample.xlsx",
    sheet: "Targets",
    rows: [
      { CODE: "01900000001", GA: 100, C2C: 50000, SC: 20000, SSO: 25, LSO: 40 },
      { CODE: "01900000002", GA: 120, C2C: 60000, SC: 25000, SSO: 30, LSO: 45 },
      { CODE: "R000001", GA: 80, C2C: 0, SC: 0, SSO: 0, LSO: 0 },
      { CODE: "R000002", GA: 60, C2C: 0, SC: 0, SSO: 0, LSO: 0 },
    ],
  },
};

export async function GET(_: Request, { params }: { params: Promise<{ type: string }> }) {
  const actor = await apiUser(["ADMIN", "IT"]);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Each call builds a workbook in memory; the limit is generous enough that
  // a person clicking "Download Sample" will never see it.
  const rl = await consumeRateLimit(RATE_LIMITS.download, actor.id);
  if (!rl.allowed) {
    const r = rateLimitResponse(rl.retryAfterSeconds);
    return NextResponse.json(r.body, r.init);
  }
  const { type } = await params,
    // v202: own keys only — "constructor" is on every object and crashed the sheet builder.
    d = Object.hasOwn(definitions, type.toLowerCase()) ? definitions[type.toLowerCase()] : undefined;
  if (!d) return NextResponse.json({ error: "Unsupported sample type" }, { status: 404 });
  const wb = XLSX.utils.book_new(),
    ws = XLSX.utils.json_to_sheet(d.rows);
  XLSX.utils.book_append_sheet(wb, ws, d.sheet);
  const bytes = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${d.name}"`,
      "Cache-Control": "no-store",
    },
  });
}
