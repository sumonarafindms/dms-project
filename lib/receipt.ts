/**
 * v203 — the day's receipt, as sent to the person on WhatsApp.
 *
 * The owner chose this from a list of "user friendly" additions: after
 * Accounts saves a day, one tap sends the RSO or BP what was handed to them,
 * what came back, what they paid and what they still owe — the paper slip,
 * without the paper. Everything here is built from the same figures the Daily
 * entry screen shows, so the message and the ledger cannot disagree.
 *
 * Prisma-free and pure: the entry screen (a client component) builds it, and
 * the tests call it directly.
 */

import { phoneKey } from "./phone";

export type ReceiptLine = { name: string; qty: number; value: number; money: boolean };

export type ReceiptInput = {
  name: string;
  code?: string | null;
  dateYmd: string;
  given: ReceiptLine[];
  returned: ReceiptLine[];
  sold: ReceiptLine[];
  cash: number;
  bank: number;
  bankRef?: string | null;
  /** The running due before this day. */
  dueBefore: number;
  /** The running due after it — what the person owes now. */
  dueAfter: number;
};

const tk = (v: number) => `৳${Math.round(v).toLocaleString("en-US")}`;
const count = (n: number) => n.toLocaleString("en-US");

function dmy(ymd: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : ymd;
}

/** One product line: "• Normal 150 × 30 = ৳4,500", or "• iTopup ৳10,000" for money. */
function line(l: ReceiptLine) {
  return l.money ? `• ${l.name} ${tk(l.qty)}` : `• ${l.name} × ${count(l.qty)} = ${tk(l.value)}`;
}

export function dayReceipt(r: ReceiptInput): string {
  const out: string[] = [];
  out.push(`🧾 হিসাব — ${dmy(r.dateYmd)}`);
  out.push(`নাম: ${r.name}${r.code ? ` (${r.code})` : ""}`);

  const given = r.given.filter((l) => l.qty > 0);
  const returned = r.returned.filter((l) => l.qty > 0);
  const sold = r.sold.filter((l) => l.qty > 0);

  if (given.length) {
    out.push("", "📦 দেওয়া হলো (Given):");
    for (const l of given) out.push(line(l));
  }
  if (returned.length) {
    out.push("", "↩️ ফেরত (Returned):");
    for (const l of returned) out.push(line(l));
  }
  if (sold.length) {
    out.push("", "🛒 বিক্রি (Sold, রিপোর্ট):");
    for (const l of sold) out.push(line(l));
  }
  if (r.cash > 0 || r.bank > 0) {
    out.push("", "💵 জমা (Deposited):");
    if (r.cash > 0) out.push(`• Cash ${tk(r.cash)}`);
    if (r.bank > 0) out.push(`• Bank ${tk(r.bank)}${r.bankRef ? ` (Ref ${r.bankRef})` : ""}`);
  }
  if (!given.length && !returned.length && !sold.length && !(r.cash > 0 || r.bank > 0))
    out.push("", "আজ কোনো লেনদেন নেই।");

  out.push("", `আগের বাকি: ${tk(r.dueBefore)}`);
  // A negative due is money held in credit — say so rather than print "−৳500".
  out.push(
    r.dueAfter < 0
      ? `✅ এখন অগ্রিম জমা: ${tk(-r.dueAfter)}`
      : r.dueAfter === 0
        ? "✅ এখন বাকি: ৳0 (পরিশোধিত)"
        : `🔴 এখন মোট বাকি: ${tk(r.dueAfter)}`,
  );
  out.push("", "ধন্যবাদ 🙏");
  return out.join("\n");
}

/**
 * A WhatsApp link that opens a chat with this number and the text typed in.
 *
 * Bangladeshi numbers are stored every way — 017…, 8801…, +8801…, 17… — so
 * the number is reduced to its national digits and given the 880 country code
 * WhatsApp needs. Without a usable number the link opens WhatsApp's own
 * contact picker with the text ready, which is still one tap from sent.
 */
export function whatsappLink(phone: string | null | undefined, text: string) {
  const key = phoneKey(phone);
  const to = /^1\d{9}$/.test(key) ? `880${key}` : "";
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}
