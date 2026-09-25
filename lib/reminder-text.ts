/**
 * v205 — the due reminder, as sent on WhatsApp. Prisma-free: the reminders
 * list (a client component) builds it, and the tests call it directly.
 *
 * Polite, short and exact: who, how much, the last money that came in, and a
 * thank-you. A reminder that sounds like a threat gets ignored or argued with;
 * one that states the figure gets paid.
 */

const tk = (v: number) => `৳${Math.round(v).toLocaleString("en-US")}`;
const dmy = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(2, 4)}`;

export function reminderText(r: {
  name: string;
  due: number;
  today: string;
  lastDeposit: string | null;
  lastAmount?: number | null;
}) {
  const out: string[] = [];
  out.push(`🔔 বাকি টাকার রিমাইন্ডার — ${dmy(r.today)}`);
  out.push("");
  out.push(`প্রিয় ${r.name},`);
  out.push(`আজ পর্যন্ত আপনার মোট বাকি: ${tk(r.due)}`);
  out.push(
    r.lastDeposit
      ? `শেষ জমা: ${dmy(r.lastDeposit)}${r.lastAmount ? ` (${tk(r.lastAmount)})` : ""}`
      : "এখনো কোনো জমা পাওয়া যায়নি।",
  );
  out.push("");
  out.push("অনুগ্রহ করে যত দ্রুত সম্ভব জমা দিন। কোনো হিসাবে ভুল মনে হলে অফিসে জানান।");
  out.push("ধন্যবাদ 🙏");
  return out.join("\n");
}

/** Whole days from one YYYY-MM-DD to another. */
export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Who sees the reminders list and may send one: those who chase money, each within their own scope. */
export const REMINDER_ROLES = ["ACCOUNTS", "ADMIN", "IT", "MANAGER", "SUPERVISOR"];
