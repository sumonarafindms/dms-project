import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { rel as relativeTo } from "./paths";
import { EXCEL_DEFAULT_WIDTH, reportWorkbook } from "../lib/report-workbook";
import { retailerIdentity } from "../lib/report-builders";
import type { ExportRow } from "../lib/report-builders";

/**
 * A spreadsheet column holds one fact, and the sheet is readable when opened.
 *
 * ## What was wrong
 *
 * The exports packed two facts into one cell to save width on a screen that is
 * not where a spreadsheet is read. `Context` held `"Shaheen / Dipu"` — a
 * supervisor and an RSO — and `Execution` held
 * `"SSO pending, LSO pending"`. Both are fine in a table and useless in Excel,
 * which exists to sort and filter columns: nobody can filter one supervisor's
 * outlets out of a column that also contains RSO names. The RSO's wallet
 * number, which is what you dial to chase an outlet, was not in the file at
 * all.
 *
 * ## What is guarded
 *
 * Two different things, because they fail differently.
 *
 * The **shape** rules are checked by reading `lib/report-builders.ts`: no
 * heading may be a vague catch-all, and no cell may join two facts with `/` or
 * `,`. That is a source rule and a static check is the honest way to hold it.
 *
 * The **workbook** rules are checked by building a real file and reading it
 * back — header frozen and bold, a width per column, numbers stored as numbers,
 * wallet numbers still carrying their leading zero. Asserting that the code
 * *calls* `ws.views = [{state: "frozen"}]` would prove nothing: `xlsx`, the
 * library this replaced, accepts that assignment and silently writes no pane at
 * all. That was measured, and it is why the assertions below open the file.
 */

const ROOT = path.join(__dirname, "..");
const builders = () => fs.readFileSync(path.join(ROOT, "lib", "report-builders.ts"), "utf8");

/** Source with comments removed — a comment about a bug is not the bug. */
const codeOf = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("export column shape", () => {
  it("has no column that means different things in different reports", () => {
    /*
     * "Context" was one column holding a supervisor, or a supervisor and an
     * RSO, or a retailer count, depending on which report and which grouping
     * produced it — and the file carries no record of which. "Name" and "Code"
     * are the same problem in milder form: a sheet whose first column is
     * headed "Name" does not say whose.
     */
    const src = codeOf(builders());
    for (const banned of ["Context:", "Execution:", '"Context"', '"Execution"']) {
      expect(src, `"${banned}" is a column heading that does not say what it holds`).not.toContain(banned);
    }
    expect(src).not.toMatch(/\n\s+Name: r\.name,/);
  });

  it("joins no two facts into one exported cell", () => {
    /*
     * The tell is a template literal inside an export row that glues two
     * fields together — `${r.supervisor} / ${r.employeeName}`. Display rows may
     * do this (`sub` is exactly that, deliberately); export rows may not.
     */
    const src = codeOf(builders());
    const exportBlocks = [...src.matchAll(/exportRows:[\s\S]*?\n  \};/g)].map((m) => m[0]);
    expect(exportBlocks.length, "no export blocks found — did the field get renamed?").toBeGreaterThan(6);
    const offenders: string[] = [];
    for (const block of exportBlocks)
      for (const m of block.matchAll(/`[^`]*\$\{[^}]+\}[^`]*[/,][^`]*\$\{[^}]+\}[^`]*`/g)) offenders.push(m[0]);
    expect(offenders, `these export cells hold more than one fact:\n  ${offenders.join("\n  ")}`).toEqual([]);
  });

  it("gives every retailer export the identity people actually need", () => {
    const src = builders();
    // The complaint that started this: supervisor and RSO crammed together,
    // and no wallet number anywhere.
    for (const heading of ['"Retailer Wallet"', '"RSO Wallet"', "Supervisor:", "RSO:", "Category:", "Route:", "BP:"]) {
      expect(src, `retailerIdentity no longer exports ${heading}`).toContain(heading);
    }
  });

  it("writes an empty cell rather than a dash for a missing value", () => {
    /*
     * A dash is a value in a spreadsheet: it sorts, it survives a filter, and
     * COUNTA counts it. The UI's "—" must not reach the file.
     *
     * This runs `retailerIdentity` rather than grepping for the helper's name.
     * The first version did the latter — it asserted `blankIfDash` appeared in
     * the file near `retailerIdentity` — and stayed green when the helper was
     * mutated to return its input unchanged. It was checking that a name
     * existed, which is not the same as checking that anything happens.
     */
    const row = {
      retailerName: "Shop",
      retailerCode: "R1",
      retailerWallet: "—",
      category: "—",
      route: "Route 1",
      supervisor: "Shuvo",
      employeeName: "Pranto",
      employeeMsisdn: "—",
      bpName: "—",
    } as unknown as Parameters<typeof retailerIdentity>[0];
    const out = retailerIdentity(row);
    expect(out["Retailer Wallet"]).toBe("");
    expect(out["RSO Wallet"]).toBe("");
    expect(out.Category).toBe("");
    expect(out.BP).toBe("");
    // Real values are untouched — a helper that blanked everything would also
    // have passed the assertions above.
    expect(out.Route).toBe("Route 1");
    expect(out.Supervisor).toBe("Shuvo");
    expect(out.RSO).toBe("Pranto");
  });

  it("keeps SSO and LSO as separate yes/no columns", () => {
    const src = codeOf(builders());
    expect(src).toMatch(/doneOrPending/);
    // "show me every outlet whose SSO is pending" must be a filter, not a
    // substring search inside a sentence.
    expect(src).not.toMatch(/SSO \$\{[^}]+\}[^`]*LSO/);
  });
});

describe("the workbook people open", () => {
  const rows: ExportRow[] = [
    {
      Retailer: "1 to 99 STORE AND COMMUNICATION CENTRE",
      "Retailer Code": "R401748",
      "Retailer Wallet": "01700000001",
      Supervisor: "Shuvo",
      RSO: "Pranto",
      // Deliberately a NUMBER, not a string. A wallet that arrives numeric is
      // the case the column's text coercion exists for, and passing a string
      // here would let the assertion pass on the data's accident rather than on
      // anything the workbook builder does.
      "RSO Wallet": 1937614431,
      GA: 1234,
      "Achievement %": 87.5,
      SSO: "Pending",
    },
    {
      Retailer: "B",
      "Retailer Code": "R581035",
      "Retailer Wallet": "",
      Supervisor: "Shaheen",
      RSO: "Dipu",
      "RSO Wallet": "01915309504",
      GA: 0,
      "Achievement %": 0,
      SSO: "Complete",
    },
  ];

  async function open() {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    // `load` is typed to Node's Buffer while `writeBuffer` yields an
    // ArrayBuffer-backed one; the bytes are identical.
    await wb.xlsx.load((await reportWorkbook(rows)) as unknown as Parameters<typeof wb.xlsx.load>[0]);
    return wb.worksheets[0];
  }

  it("freezes the header so row 400 still says which column is which", async () => {
    const ws = await open();
    const frozen = ws.views.find((v) => v.state === "frozen") as { ySplit?: number } | undefined;
    expect(frozen, "the header scrolls away").toBeTruthy();
    expect(frozen!.ySplit).toBe(1);
  });

  it("makes the header stand out from the data", async () => {
    const ws = await open();
    expect(ws.getRow(1).font?.bold).toBe(true);
    expect(ws.getRow(1).fill).toBeTruthy();
  });

  it("sizes every column to its widest value", async () => {
    const ws = await open();
    /*
     * `?? EXCEL_DEFAULT_WIDTH`, not `?? 0`.
     *
     * A column set to exactly Excel's default is omitted from the file, and
     * reads back as undefined. Treating that as zero would have failed this
     * test on a perfectly good report — it nearly did, on the LSO column of the
     * real retailer export, whose longest value is "Pending" and which
     * therefore lands on exactly the default. Absent means default, not
     * missing.
     */
    const widths = ws.columns.map((c) => c.width ?? EXCEL_DEFAULT_WIDTH);
    const headings = ws.getRow(1).values as unknown[];

    for (let i = 0; i < widths.length; i++) {
      const heading = String(headings[i + 1] ?? "");
      const longest = Math.max(heading.length, ...rows.map((r) => String(r[heading] ?? "").length));
      expect(widths[i], `"${heading}" is ${widths[i]} wide but holds ${longest} characters`).toBeGreaterThanOrEqual(
        Math.min(longest, 40),
      );
    }
    // The 37-character retailer name must get a wider column than "GA".
    expect(widths[0]).toBeGreaterThan(widths[6]);
    expect(widths[0]).toBeGreaterThanOrEqual(37);
  });

  it("stores numbers as numbers so SUM works", async () => {
    const ws = await open();
    expect(typeof ws.getRow(2).getCell(7).value).toBe("number");
    expect(ws.getColumn(7).numFmt).toBe("#,##0");
  });

  it("does not eat the leading zero off a wallet number", async () => {
    const ws = await open();
    /*
     * `01700000001` becomes 1700000001 the moment Excel decides it is a number,
     * and a Bangladeshi mobile number without its leading zero is not a phone
     * number. This is the whole reason wallet and code columns are forced to
     * text.
     */
    expect(ws.getRow(2).getCell(3).value).toBe("01700000001");
    expect(ws.getRow(2).getCell(6).value).toBe("1937614431");
    expect(typeof ws.getRow(2).getCell(6).value, "a numeric wallet was left as a number").toBe("string");
  });

  it("turns on sort and filter arrows", async () => {
    const ws = await open();
    expect(ws.autoFilter, "the file needs setting up before it is usable").toBeTruthy();
  });
});

describe("the targets page cannot be edited by scrolling", () => {
  const targets = () => codeOf(fs.readFileSync(path.join(ROOT, "app", "targets", "page.tsx"), "utf8"));

  it("has no raw number input anywhere in the app", () => {
    /*
     * The rule that v153 wrote for one page, applied where it belongs.
     *
     * v153 replaced the Targets grid's number inputs with a dialog and guarded
     * that page. v155 found the same unguarded `<input type="number">` twice
     * more — both BP GA target fields — because the guard had been written
     * where the bug was noticed rather than where number fields are made. The
     * wheel hazard belongs to the control, so it lives in `NumberInput` and
     * this check covers every file rather than one.
     */
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (/\.tsx$/.test(e.name) && e.name !== "Kit.tsx") {
          if (/type="number"/.test(codeOf(fs.readFileSync(full, "utf8")))) offenders.push(relativeTo(ROOT)(full));
        }
      }
    };
    walk(path.join(ROOT, "app"));
    expect(
      offenders,
      `these use a raw number input instead of NumberInput, so a scroll can change their value:\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });

  it("guards the wheel inside NumberInput itself", () => {
    const kit = codeOf(fs.readFileSync(path.join(ROOT, "app", "components", "Kit.tsx"), "utf8"));
    expect(kit).toMatch(/export function NumberInput/);
    // Blur, not preventDefault: stopping the event would freeze page scrolling
    // whenever the pointer crossed a field.
    expect(kit).toMatch(/onWheel=\{\(e\) => \{[\s\S]{0,120}currentTarget\.blur\(\)/);
    expect(kit).not.toMatch(/onWheel[\s\S]{0,80}preventDefault/);
  });

  it("has no number input outside the edit dialog", () => {
    /*
     * A focused `<input type="number">` changes value on a mouse wheel. Seven
     * of them per row across twenty rows meant scrolling the page could rewrite
     * a target, and the page saves the whole grid at once, so the wrong number
     * went to the database with everything else. Nothing would have said so.
     */
    const src = targets();
    // The table renders figures; only the dialog's field factory makes an input.
    expect([...src.matchAll(/<NumberInput\b/g)], "the targets table builds inputs again").toHaveLength(1);
    expect(src, "the one field belongs to the dialog").toMatch(/draftField[\s\S]{0,400}<NumberInput/);
  });

  it("blurs a number field the wheel passes over", () => {
    // The guard moved into the kit in v155; the page inherits it by using the
    // component, which is checked above.
    const kit = codeOf(fs.readFileSync(path.join(ROOT, "app", "components", "Kit.tsx"), "utf8"));
    expect(kit).toMatch(/currentTarget\.blur\(\)/);
  });

  it("offers an edit control on every row it lets you edit", () => {
    const src = targets();
    expect(src).toMatch(/onClick=\{\(\) => openRso\(r\)\}/);
    expect(src).toMatch(/onClick=\{\(\) => openBp\(r\)\}/);
    // Both the table and the phone card view, or the phone has no way in.
    expect([...src.matchAll(/openRso\(r\)/g)].length).toBeGreaterThanOrEqual(2);
    expect([...src.matchAll(/openBp\(r\)/g)].length).toBeGreaterThanOrEqual(2);
  });

  it("still writes only through Save all changes", () => {
    /*
     * The dialog moved where a number is typed, not when it is persisted.
     *
     * This used to count occurrences of the string `method: "POST"`, and broke
     * the moment the page's requests moved behind `apiSend`/`apiUpload` — while
     * the behaviour it was protecting had not changed at all. Counting the
     * write CALLS instead survives how a request happens to be spelled, which
     * is what the rule was always about.
     */
    const src = targets();
    const writes = [...src.matchAll(/\bapi(Send|Upload)\s*[<(]|method:\s*"(POST|PUT|PATCH|DELETE)"/g)].length;
    expect(writes, "the dialog must not have gained a write of its own").toBe(2); // save() and upload()
    // And the dialog's own confirm still only touches local state.
    expect(src).toMatch(/function applyDraft\(\)[\s\S]{0,500}setRows/);
    expect(
      /function applyDraft\(\)[\s\S]{0,600}?\n  \}/.exec(src)?.[0] ?? "",
      "applyDraft sends something to the server",
    ).not.toMatch(/api(Send|Upload|Fetch)|fetch\(/);
  });

  it("does not let Cancel discard other rows' unsaved edits", () => {
    // The draft is a separate object precisely so Cancel cancels one record.
    const src = targets();
    expect(src).toMatch(/const \[draft, setDraft\] = useState/);
    expect(src).toMatch(/setEditing\(null\)/);
  });

  it("names the record being edited in the dialog header", () => {
    const src = fs.readFileSync(path.join(ROOT, "app", "targets", "page.tsx"), "utf8");
    // Which person's targets these are must not have to be inferred from which
    // row the cursor was on.
    expect(src).toMatch(/title=\{editingRso\.name\}/);
    expect(src).toMatch(/sub=\{`\$\{editingRso\.supervisor\}/);
  });
});

describe("the import parser is untouched", () => {
  it("still reads uploads with xlsx and writes downloads without it", () => {
    // exceljs replaced xlsx for WRITING only. The import parsers are where the
    // hardening and the tests live, and they keep their reader.
    const route = fs.readFileSync(path.join(ROOT, "app", "api", "reports", "export", "route.ts"), "utf8");
    expect(codeOf(route)).not.toMatch(/from "xlsx"/);
    for (const f of ["lib/ga-import.ts", "lib/c2-import-core.ts", "lib/ob-import.ts"]) {
      expect(fs.readFileSync(path.join(ROOT, f), "utf8"), `${f} lost its parser`).toMatch(/from "xlsx"/);
    }
  });

  it("keeps the workbook builder out of the browser", () => {
    const shell = fs.readFileSync(path.join(ROOT, "app", "components", "ReportShell.tsx"), "utf8");
    expect(shell).toContain('"use client"');
    expect(codeOf(shell)).not.toMatch(/exceljs|report-workbook/);
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(e.name)) {
          const src = fs.readFileSync(full, "utf8");
          if (/^"use client"/m.test(src) && /report-workbook|from "exceljs"/.test(codeOf(src)))
            offenders.push(relativeTo(ROOT)(full));
        }
      }
    };
    walk(path.join(ROOT, "app"));
    expect(offenders, `client components importing the workbook builder: ${offenders.join(", ")}`).toEqual([]);
  });
});
