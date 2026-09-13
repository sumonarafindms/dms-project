/**
 * What an uploaded file must satisfy before any parser is allowed near it.
 *
 * Order matters: the cheap checks (size, extension) run first so a hostile or
 * mistaken upload is rejected before its bytes are read, and the content check
 * runs before the workbook is handed to the spreadsheet parser.
 */

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/**
 * The most rows any single sheet may contribute.
 *
 * A 20 MB xlsx is a zip: it can legitimately hold well over a million rows,
 * and the import routes run on a serverless function with a 60-second budget.
 * Without a cap, one oversized file is an availability incident rather than a
 * failed import — and the failure mode is a timeout with no message, which
 * tells the operator nothing.
 *
 * 250,000 is far above any real file this business produces (a month of GA
 * activations across the whole distribution house is tens of thousands). Raise
 * it deliberately if a genuine file ever approaches it; do not raise it to make
 * one bad file import.
 */
export const MAX_SHEET_ROWS = 250_000;

/**
 * Container signatures, checked against the file's actual first bytes.
 *
 * `file.type` is whatever the browser felt like sending — it is absent on many
 * platforms, wrong on others, and trivially forged — so it is NOT trusted here.
 * The extension is likewise just a name. These four bytes are the real thing:
 *
 *   PK\x03\x04                          zip, which is what xlsx and xlsm are
 *   \xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1    OLE2 compound file, which is xls
 */
const ZIP = [0x50, 0x4b, 0x03, 0x04];
const OLE2 = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
/** Executables, for the .txt check below: ELF is Linux, MZ is Windows. */
const ELF = [0x7f, 0x45, 0x4c, 0x46];
const MZ = [0x4d, 0x5a];

const startsWith = (bytes: Uint8Array, sig: number[]) => sig.every((b, i) => bytes[i] === b);

/** Name and size checks. Returns an error message, or null when acceptable. */
export function validateUploadFile(file: File, extensions: string[]) {
  if (file.size <= 0) return "Uploaded file is empty.";
  if (file.size > MAX_UPLOAD_BYTES) return "File is too large. Maximum upload size is 20 MB.";
  const name = file.name.toLowerCase();
  if (!extensions.some((ext) => name.endsWith(ext))) return `Unsupported file type. Allowed: ${extensions.join(", ")}`;
  return null;
}

/**
 * Confirm the bytes are the kind of file the name claims.
 *
 * This is what stops a renamed executable, an HTML page, or a zip bomb with a
 * .xlsx name from reaching the spreadsheet parser at all. `.txt` uploads are
 * accepted by the C2C/C2S importers and have no signature, so they are checked
 * for being decodable text instead of a binary blob.
 */
export function validateUploadContent(name: string, bytes: Uint8Array) {
  const lower = name.toLowerCase();

  /*
   * A `.xls` from this carrier is very often not a workbook at all.
   *
   * The owner's real C2C, C2S and Opening Balance exports are named `.xls` and
   * begin with the letters `CLUSTER_NAME` — they are tab-separated text that
   * the portal saves under a spreadsheet extension. Every importer already
   * reads that correctly (see `looksLikeWorkbook` below, and v156), but this
   * function ran first and rejected all three outright:
   *
   *     That file is not a valid .xls workbook. Please re-save it from Excel.
   *
   * So the daily upload could not even start, and the message blamed the file
   * and prescribed a fix — re-save it from Excel — that would have been extra
   * work for a file that was never wrong. The guard was written before anyone
   * had seen one of these files.
   *
   * What this check is actually for is stopping a renamed executable or a
   * booby-trapped archive from reaching the spreadsheet parser. That is what it
   * still does. Deciding whether the bytes are a workbook or a text export is
   * the importer's job, and it is equipped for it; refusing the file on a name
   * mismatch was never the security boundary, only a guess about intent.
   */
  if (startsWith(bytes, ELF) || startsWith(bytes, MZ))
    return "That file is a program, not a spreadsheet or a text export.";

  if (lower.endsWith(".txt")) {
    // Do NOT test "is this text" by looking for NUL bytes. The C2C/C2S
    // exports are frequently UTF-16LE, in which roughly every second byte IS
    // a NUL — `decodeReportText` in lib/c2-import-core.ts detects exactly
    // that. A NUL-byte test would reject the real files.
    //
    // So this asks the answerable question instead: are these the bytes of a
    // known binary container wearing a .txt name?
    for (const sig of [ZIP, OLE2])
      if (startsWith(bytes, sig)) return "That file is not a text export. Please upload the original .txt file.";
    return null;
  }

  /*
   * `.xls`, `.xlsx`, `.xlsm`: a real workbook container, or a text export under
   * a spreadsheet name. Anything else — a PDF, an image, a random binary — has
   * no chance of parsing and is worth refusing here, with a message that says
   * what was actually wrong rather than telling the operator to re-save a file
   * that is fine.
   */
  if (startsWith(bytes, ZIP) || startsWith(bytes, OLE2)) return null;
  /*
   * A saved web page is text, so the permissive rule above would let it
   * through — and the spreadsheet library will cheerfully parse the `<table>`
   * in it, producing a confusing failure three steps later. Someone who saved
   * the portal page instead of exporting the report deserves to be told that
   * here, where it is still obvious what they did.
   */
  if (looksLikeHtml(bytes)) return "That looks like a saved web page. Please export the report from the portal.";
  if (looksLikeTextExport(bytes)) return null;
  return "That file is neither a spreadsheet nor a text export. Please upload the report as it came from the portal.";
}

/** A saved web page rather than a report export. */
export function looksLikeHtml(bytes: Uint8Array) {
  // UTF-16 puts a NUL between every character, so the NULs are stripped before
  // looking — otherwise a UTF-16 HTML file would slip past.
  const head = Buffer.from(bytes.subarray(0, 1024))
    .toString("latin1")
    .replace(/\0/g, "")
    .trimStart()
    .toLowerCase();
  return head.startsWith("<!doctype html") || head.startsWith("<html") || /^<\?xml[^>]*>\s*<html/.test(head);
}

/**
 * Are these bytes plausibly the carrier's text export?
 *
 * Deliberately permissive, and deliberately not a NUL-byte test: these exports
 * are frequently UTF-16LE, where roughly every second byte is NUL. What it
 * rejects is a binary blob — a PDF, a JPEG, a database file — by looking for
 * control characters that no text export contains.
 */
export function looksLikeTextExport(bytes: Uint8Array) {
  const sample = bytes.subarray(0, 4096);
  if (!sample.length) return false;
  let odd = 0;
  for (const b of sample) {
    // Tab, LF, CR and everything printable are fine; so is any high byte,
    // which is how UTF-8 Bengali and UTF-16 both look.
    if (b === 0x09 || b === 0x0a || b === 0x0d || b >= 0x20) continue;
    // NUL is expected in UTF-16LE and does not count against the file.
    if (b === 0x00) continue;
    odd++;
  }
  return odd / sample.length < 0.05;
}

/**
 * Guard a parsed sheet's size. Throws, because every importer already turns a
 * thrown Error into a 400 with its message (see `importValidationError`).
 */
export function assertRowLimit(rowCount: number, what = "sheet") {
  if (rowCount > MAX_SHEET_ROWS)
    throw new Error(
      `This ${what} has ${rowCount.toLocaleString()} rows, above the ${MAX_SHEET_ROWS.toLocaleString()} row limit. Split the file and import it in parts.`,
    );
}

/**
 * Does this file start with a spreadsheet container's signature?
 *
 * ## The bug this exists to end
 *
 * Two importers — C2C/C2S and Opening Balance — accept a tab-separated text
 * export as well as a workbook, and both decided which they had by *sniffing
 * the text*: decode the bytes, look for a tab and the word `RETAILER_CODE`.
 *
 * A legacy `.xls` is an OLE2 container whose strings are stored UTF-16. Decoded
 * as UTF-16 it is full of tab bytes, and `RETAILER_CODE` — a real heading in
 * the file — appears in plain sight. So the sniffer claimed every `.xls`, split
 * the binary on tabs, and handed back a matrix of mojibake. The workbook parser
 * was never reached, and the upload failed with:
 *
 *     Required headings missing: RETAILER_CODE, RETAILER_ITOPUP_NO, …
 *     Best header candidate was row 1 and contained: 쿐놡>￾, က￾￿￿￿￿…
 *
 * — an error naming the exact headings the file does contain. Every `.xls`
 * C2C, C2S and OB upload has been failing this way, and `.xlsx` worked, which
 * is what made it look like a file problem rather than a code one.
 *
 * ## Why magic bytes rather than the filename
 *
 * The extension is chosen by whoever saved the file and is routinely wrong —
 * carrier portals hand out `.xls` files that are really HTML tables, and
 * `.txt` exports that are really tab-separated. The first bytes are written by
 * the program that produced the file, so they are the one honest signal.
 *
 * Recognised: OLE2 (`.xls`, BIFF5/8), ZIP (`.xlsx`/`.xlsm`, and anything else
 * SheetJS unpacks), and the bare BIFF2 record header older tools still emit.
 */
export function looksLikeWorkbook(bytes: Buffer): boolean {
  if (bytes.length < 4) return false;
  // OLE2 compound file: D0 CF 11 E0 A1 B1 1A E1 — every real .xls Excel writes.
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return true;
  // ZIP local file header: PK\x03\x04 — .xlsx and .xlsm are ZIP archives.
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return true;
  // BIFF2 BOF record: 09 00 followed by a small record length.
  if (bytes[0] === 0x09 && bytes[1] === 0x00) return true;
  return false;
}
