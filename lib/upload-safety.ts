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
  if (lower.endsWith(".txt")) {
    // Do NOT test "is this text" by looking for NUL bytes. The C2C/C2S
    // exports are frequently UTF-16LE, in which roughly every second byte IS
    // a NUL — `decodeReportText` in lib/c2-import-core.ts detects exactly
    // that. A NUL-byte test would reject the real files.
    //
    // So this asks the answerable question instead: are these the bytes of a
    // known binary container wearing a .txt name?
    for (const sig of [ZIP, OLE2, ELF, MZ])
      if (startsWith(bytes, sig)) return "That file is not a text export. Please upload the original .txt file.";
    return null;
  }
  if (lower.endsWith(".xls")) {
    if (!startsWith(bytes, OLE2)) return "That file is not a valid .xls workbook. Please re-save it from Excel.";
    return null;
  }
  // .xlsx / .xlsm
  if (!startsWith(bytes, ZIP)) return "That file is not a valid Excel workbook. Please re-save it from Excel.";
  return null;
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
