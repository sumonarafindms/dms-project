"use client";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useCan } from "../components/PermissionContext";
import {
  OpsHeader,
  OpsUpload,
  OpsSectionTitle,
  OpsMetric,
  OpsDataCard,
  OpsTable,
  PersonCell,
  ProgressCell,
  EmptyState,
  StatusPill,
  OpsFreshness,
} from "../components/OperationsPremiumUI";
import { dhakaTodayYmd } from "../../lib/business-time";

type Row = {
  employeeId: string;
  employeeCode?: string | null;
  name: string;
  rsoMsisdn: string;
  supervisor: string;
  retailerCount: number;
  transactionCount: number;
  c2sAmount: number;
  lsoTarget: number;
  lsoAchieved: number;
  lsoPercent: number;
  reportEndDate?: string | null;
};
type DailyRow = {
  retailerCode: string;
  retailerName: string;
  employee: string;
  rsoMsisdn: string;
  supervisor: string;
  amount: number;
};
type History = {
  id: string;
  fileName: string;
  uploadedAt: string;
  businessDate?: string | null;
  totalRows: number;
  successRows: number;
  failedRows: number;
  status: string;
};
function todayYmd() {
  return dhakaTodayYmd();
}
function money(n: number) {
  return new Intl.NumberFormat("en-BD", { maximumFractionDigits: 2 }).format(n);
}

export default function C2sPage() {
  const canView = useCan("c2s", "view");
  const canAdd = useCan("c2s", "add");
  const [month, setMonth] = useState(() => todayYmd().slice(0, 7));
  const [date, setDate] = useState(() => todayYmd());
  const [fromDate, setFromDate] = useState(() => `${todayYmd().slice(0, 7)}-01`);
  const [toDate, setToDate] = useState(() => todayYmd());
  const [rows, setRows] = useState<Row[]>([]);
  const [dailyRows, setDailyRows] = useState<DailyRow[]>([]);
  const [history, setHistory] = useState<History[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  async function load(overrides?: { month?: string; date?: string; from?: string; to?: string }) {
    const nextMonth = overrides?.month || month,
      nextDate = overrides?.date || date,
      nextFrom = overrides?.from || fromDate,
      nextTo = overrides?.to || toDate;
    const p = new URLSearchParams({
      month: `${nextMonth}-01`,
      date: nextDate,
      from: nextFrom,
      to: nextTo,
      _: String(Date.now()),
    });
    const res = await fetch(`/api/c2s/summary?${p}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) return setMessage(data.error || "Failed to load C2S data");
    setRows(data.rows || []);
    setDailyRows(data.dailyRows || []);
    setHistory(data.importHistory || []);
  }
  useEffect(() => {
    load();
  }, [month, date, fromDate, toDate]);
  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem("file") as HTMLInputElement;
    if (!input.files?.[0]) return;
    setLoading(true);
    setMessage("Reading month-to-date C2S report and rebuilding date-wise retailer sales...");
    const body = new FormData();
    body.append("file", input.files[0]);
    const res = await fetch("/api/import/C2S", { method: "POST", body });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) return setMessage(data.error || "C2S import failed");
    if (data.duplicate) setMessage("This exact C2S file was already imported. Nothing was counted twice.");
    else {
      setMessage(
        `C2S updated ${data.reportStartDate} → ${data.reportEndDate}. ${data.successRows} retailers mapped, ${data.failedRows} failed, ${data.dailyRecordsStored} non-zero retailer/day sales stored.${data.assignmentWarnings ? ` ${data.assignmentWarnings} RSO assignment mismatch warning(s).` : ""}`,
      );
      if (data.reportStartDate && data.reportEndDate) {
        const nextMonth = data.reportEndDate.slice(0, 7);
        setDate(data.reportEndDate);
        setMonth(nextMonth);
        setFromDate(data.reportStartDate);
        setToDate(data.reportEndDate);
        input.value = "";
        await load({ month: nextMonth, date: data.reportEndDate, from: data.reportStartDate, to: data.reportEndDate });
        return;
      }
    }
    input.value = "";
    await load();
  }
  const totals = useMemo(
    () =>
      rows.reduce(
        (a, r) => ({
          amount: a.amount + r.c2sAmount,
          trx: a.trx + r.transactionCount,
          lsoT: a.lsoT + r.lsoTarget,
          lsoA: a.lsoA + r.lsoAchieved,
        }),
        { amount: 0, trx: 0, lsoT: 0, lsoA: 0 },
      ),
    [rows],
  );
  const dayTotal = useMemo(() => dailyRows.reduce((s, r) => s + r.amount, 0), [dailyRows]);
  if (!canView) return null;
  return (
    <main className="page">
      <OpsHeader
        badge="C2S"
        title="C2S Retailer Sales & LSO"
        subtitle="Track retailer sales, daily performance and LSO achievement from one premium operations workspace."
        from={fromDate}
        to={toDate}
        onFrom={(v) => {
          setFromDate(v);
          setMonth(v.slice(0, 7));
          if (toDate < v) setToDate(v);
        }}
        onTo={setToDate}
      />
      <OpsFreshness
        label="C2S"
        businessDate={history[0]?.businessDate}
        uploadedAt={history[0]?.uploadedAt}
        fileName={history[0]?.fileName}
        range={`${fromDate} → ${toDate}`}
      />

      {canAdd && (
        <OpsUpload
          title="Upload C2S File"
          subtitle="Import the cumulative ITop Up Sales workbook."
          sample="/api/samples/c2s"
          message={message}
          rule={
            <>
              <b>LSO rule:</b> A retailer completes LSO when monthly C2S reaches at least 500 with at least 7
              transactions. Each upload is the authoritative month-to-date snapshot: DMS replaces that month before
              saving the new file, then recalculates retailer sales and LSO from the refreshed data.
            </>
          }
        >
          <form onSubmit={upload} className="kit-upload-form">
            <label className="kit-file-field">
              <span>ITop_Up_Sales file</span>
              <small>Excel / TXT · max 20 MB</small>
              <input name="file" type="file" accept=".xls,.xlsx,.xlsm,.txt" required />
            </label>
            <button disabled={loading} className="kit-btn is-primary size-md">
              {loading ? "Processing..." : "⇧  Upload C2S"}
            </button>
          </form>
        </OpsUpload>
      )}

      <section>
        <OpsSectionTitle
          title="Employee LSO Performance"
          subtitle="Retail sales and LSO execution across the selected range."
          icon="↗"
        />
        <div className="kit-metrics-grid">
          <OpsMetric tone="blue" label="C2S Sales" value={money(totals.amount)} note="Retail sales amount" />
          <OpsMetric
            tone="cyan"
            label="Monthly Transactions"
            value={totals.trx.toLocaleString()}
            note="Exact TRANSACTION_COUNT from source"
          />
          <OpsMetric tone="orange" label="LSO Target" value={totals.lsoT.toLocaleString()} note="Monthly target" />
          <OpsMetric tone="green" label="LSO Achieved" value={totals.lsoA.toLocaleString()} note="Completed outlets" />
          <OpsMetric
            tone="purple"
            label="LSO %"
            value={totals.lsoT ? `${((totals.lsoA / totals.lsoT) * 100).toFixed(1)}%` : "0%"}
            note="Achievement rate"
          />
        </div>
      </section>

      <OpsDataCard
        title="RSO LSO Performance"
        subtitle="Employee-level C2S sales and LSO completion."
        count={`${rows.length} employees`}
      >
        {rows.length ? (
          <OpsTable>
            <thead>
              <tr>
                <th>Supervisor</th>
                <th>Employee</th>
                <th>Retailers</th>
                <th>Transactions</th>
                <th>C2S Amount</th>
                <th>LSO Target</th>
                <th>LSO Achieved</th>
                <th>LSO Progress</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.employeeId}>
                  <td>
                    <PersonCell name={r.supervisor} sub="Supervisor" />
                  </td>
                  <td>
                    <PersonCell name={r.name} sub={r.employeeCode || r.rsoMsisdn} />
                  </td>
                  <td>
                    <span className="kit-count-pill">{r.retailerCount}</span>
                  </td>
                  <td>{r.transactionCount}</td>
                  <td>
                    <strong className="kit-num">৳{money(r.c2sAmount)}</strong>
                  </td>
                  <td>{r.lsoTarget}</td>
                  <td>
                    <strong className="kit-num">{r.lsoAchieved}</strong>
                  </td>
                  <td>
                    <ProgressCell value={r.lsoPercent} />
                  </td>
                </tr>
              ))}
            </tbody>
          </OpsTable>
        ) : (
          <EmptyState title="No C2S performance yet" subtitle="Upload C2S data to populate employee LSO performance." />
        )}
      </OpsDataCard>

      <section>
        <OpsSectionTitle
          title={`Date-wise C2S · ${new Date(date + "T00:00:00").toLocaleDateString()}`}
          subtitle="Retailers with customer sales on the selected day."
          icon="▣"
          right={
            <label className="kit-field kit-inline-date">
              <span>VIEW DATE</span>
              <input
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  if (e.target.value) setMonth(e.target.value.slice(0, 7));
                }}
              />
            </label>
          }
        />
        <div className="kit-metrics-grid">
          <OpsMetric tone="green" label="Selected Day Sales" value={money(dayTotal)} note="Customer sales amount" />
          <OpsMetric
            tone="purple"
            label="Retailers Selling"
            value={dailyRows.length.toLocaleString()}
            note="Active selling outlets"
          />
        </div>
      </section>

      <OpsDataCard
        title="Retailer C2S Sales"
        subtitle="Retailer-level sales for the selected date."
        count={`${dailyRows.length} retailers`}
      >
        {dailyRows.length ? (
          <OpsTable>
            <thead>
              <tr>
                <th>Supervisor</th>
                <th>Employee</th>
                <th>Retailer</th>
                <th>Sales Amount</th>
              </tr>
            </thead>
            <tbody>
              {dailyRows.map((r) => (
                <tr key={r.retailerCode}>
                  <td>
                    <PersonCell name={r.supervisor} />
                  </td>
                  <td>
                    <PersonCell name={r.employee} sub={r.rsoMsisdn} />
                  </td>
                  <td>
                    <b>{r.retailerCode}</b>
                    <small>{r.retailerName}</small>
                  </td>
                  <td>
                    <strong className="kit-num">৳{money(r.amount)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </OpsTable>
        ) : (
          <EmptyState title="No sales on this date" subtitle={`No C2S sales stored for ${date}.`} />
        )}
      </OpsDataCard>

      <OpsDataCard
        title="Recent C2S Imports"
        subtitle="Latest uploaded retailer-sales reports."
        count={`${history.length} imports`}
      >
        {history.length ? (
          <OpsTable>
            <thead>
              <tr>
                <th>Report End</th>
                <th>File</th>
                <th>Uploaded</th>
                <th>Mapped / Total</th>
                <th>Failed</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td>
                    <b>{h.businessDate ? new Date(h.businessDate).toLocaleDateString() : "-"}</b>
                  </td>
                  <td>{h.fileName}</td>
                  <td>{new Date(h.uploadedAt).toLocaleString()}</td>
                  <td>
                    <strong className="kit-num">
                      {h.successRows}/{h.totalRows}
                    </strong>
                  </td>
                  <td>{h.failedRows}</td>
                  <td>
                    <StatusPill value={h.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </OpsTable>
        ) : (
          <EmptyState title="No C2S imports yet" subtitle="Your recent C2S files will appear here." icon="⇧" />
        )}
      </OpsDataCard>
    </main>
  );
}
