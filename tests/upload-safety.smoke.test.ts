import { describe, expect, it } from "vitest";
import {
  MAX_SHEET_ROWS,
  MAX_UPLOAD_BYTES,
  assertRowLimit,
  validateUploadContent,
  validateUploadFile,
} from "../lib/upload-safety";

/** Byte prefixes used by the real formats, as a parser would see them. */
const zip = (n = 64) => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(n)]);
const ole2 = (n = 64) =>
  Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(n)]);
const elf = () => Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.alloc(64)]);
const fakeFile = (name: string, size: number) => ({ name, size }) as File;

describe("upload file checks", () => {
  it("rejects empty and oversized files", () => {
    expect(validateUploadFile(fakeFile("a.xlsx", 0), [".xlsx"])).toMatch(/empty/i);
    expect(validateUploadFile(fakeFile("a.xlsx", MAX_UPLOAD_BYTES + 1), [".xlsx"])).toMatch(/too large/i);
    expect(validateUploadFile(fakeFile("a.xlsx", MAX_UPLOAD_BYTES), [".xlsx"])).toBeNull();
  });

  it("rejects an extension the endpoint does not accept", () => {
    expect(validateUploadFile(fakeFile("payload.exe", 10), [".xlsx", ".xls"])).toMatch(/Unsupported/);
    expect(validateUploadFile(fakeFile("BOOK.XLSX", 10), [".xlsx"])).toBeNull();
  });
});

describe("upload content checks", () => {
  it("accepts the real container for each extension", () => {
    expect(validateUploadContent("book.xlsx", zip())).toBeNull();
    expect(validateUploadContent("book.xlsm", zip())).toBeNull();
    expect(validateUploadContent("book.xls", ole2())).toBeNull();
  });

  it("rejects a file whose bytes do not match its name", () => {
    // The attack this exists for: anything renamed to .xlsx to reach the
    // spreadsheet parser.
    expect(validateUploadContent("evil.xlsx", elf())).toMatch(/not a valid Excel/i);
    expect(validateUploadContent("evil.xlsx", Buffer.from("<html>hello</html>"))).toMatch(/not a valid Excel/i);
    // An xlsx (zip) renamed to .xls is still wrong: the parser branches on it.
    expect(validateUploadContent("book.xls", zip())).toMatch(/not a valid \.xls/i);
  });

  it("accepts UTF-16 text exports, which are full of NUL bytes", () => {
    // The trap: C2C/C2S exports are frequently UTF-16LE, where roughly every
    // second byte is 0x00 (see decodeReportText in lib/c2-import-core.ts). A
    // "does it contain NUL?" test would reject every one of them, and an
    // earlier draft of validateUploadContent did exactly that.
    const utf16le = Buffer.from("﻿RETAILER_CODE\tAMOUNT\r\nR000001\t500\r\n", "utf16le");
    expect(utf16le.includes(0)).toBe(true);
    expect(validateUploadContent("c2s.txt", utf16le)).toBeNull();

    const utf8 = Buffer.from("RETAILER_CODE\tAMOUNT\r\nR000001\t500\r\n", "utf8");
    expect(validateUploadContent("c2s.txt", utf8)).toBeNull();
  });

  it("still rejects a binary wearing a .txt name", () => {
    expect(validateUploadContent("c2s.txt", elf())).toMatch(/not a text export/i);
    expect(validateUploadContent("c2s.txt", zip())).toMatch(/not a text export/i);
  });
});

describe("sheet row limit", () => {
  it("allows a sheet at the limit and rejects one above it", () => {
    expect(() => assertRowLimit(MAX_SHEET_ROWS, "GA workbook")).not.toThrow();
    expect(() => assertRowLimit(MAX_SHEET_ROWS + 1, "GA workbook")).toThrow(/row limit/i);
  });

  it("names the sheet and both numbers, so the operator can act on it", () => {
    // A bare "too many rows" tells someone with a 300k-row file nothing about
    // what to do next.
    try {
      assertRowLimit(300_000, "C2S workbook");
      throw new Error("should have thrown");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("C2S workbook");
      expect(msg).toContain("300,000");
      expect(msg).toContain("250,000");
      expect(msg).toMatch(/split/i);
    }
  });
});
