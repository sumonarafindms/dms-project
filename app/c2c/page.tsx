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
  c2cTarget: number;
  c2cAchieved: number;
  c2cPercent: number;
  scAchieved: number;
  totalRechargeTarget: number;
  totalRechargeAchieved: number;
  totalRechargePercent: number;
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

export default function C2cPage() {
  const canView = useCan("c2c", "view");
  const canAdd = useCan("c2c", "add");
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
    const res = await fetch(`/api/c2c/summary?${p}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) return setMessage(data.error || "Failed to load C2C data");
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
    setMessage("Reading month-to-date C2C report and updating date-wise balances...");
    const body = new FormData();
    body.append("file", input.files[0]);
    const res = await fetch("/api/import/C2C", { method: "POST", body });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) return setMessage(data.error || "C2C import failed");
    if (data.duplicate) setMessage(`This exact C2C file was already imported. Nothing was counted twice.`);
    else {
      setMessage(
        `C2C updated ${data.reportStartDate} → ${data.reportEndDate}. ${data.successRows} retailers mapped, ${data.failedRows} failed, ${data.dailyRecordsStored} non-zero daily balance records stored.${data.assignmentWarnings ? ` ${data.assignmentWarnings} RSO assignment mismatch warning(s).` : ""}`,
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
          c2cT: a.c2cT + r.c2cTarget,
          c2cA: a.c2cA + r.c2cAchieved,
          sc: a.sc + r.scAchieved,
          trT: a.trT + r.totalRechargeTarget,
          trA: a.trA + r.totalRechargeAchieved,
          trx: a.trx + r.transactionCount,
        }),
        { c2cT: 0, c2cA: 0, sc: 0, trT: 0, trA: 0, trx: 0 },
      ),
    [rows],
  );
  const dayTotal = useMemo(() => dailyRows.reduce((s, r) => s + r.amount, 0), [dailyRows]);

  if (!canView) return null;
  return (
    <main className="page">
      <OpsHeader
        badge="C2C"
        title="C2C Recharge Balance"
        subtitle="Upload cumulative stock lifting, monitor RSO recharge achievement and inspect any date in the selected range."
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
        label="C2C"
        businessDate={history[0]?.businessDate}
        uploadedAt={history[0]?.uploadedAt}
        fileName={history[0]?.fileName}
        range={`${fromDate} → ${toDate}`}
      />

      {canAdd && (
        <OpsUpload
          title="Upload C2C File"
          subtitle="Import your month-to-date Stock Lifting workbook."
          sample="/api/samples/c2c"
          message={message}
          rule={
            <>
              <b>How it works:</b> RETAILER_CODE maps the outlet, SRNUMBER confirms RSO ownership, and each date column
              is stored separately. Each upload is the authoritative month-to-date snapshot: DMS replaces that month
              before saving the new file, so stale retailer/date values cannot remain.
            </>
          }
        >
          <form onSubmit={upload} className="kit-upload-form">
            <label className="kit-file-field">
              <span>ITop_Up_StockLifting file</span>
              <small>Excel / TXT · max 20 MB</small>
              <input name="file" type="file" accept=".xls,.xlsx,.xlsm,.txt" required />
            </label>
            <button disabled={loading} className="kit-btn is-primary size-md">
              {loading ? "Processing..." : "⇧  Upload C2C"}
            </button>
          </form>
        </OpsUpload>
      )}

      <section>
        <OpsSectionTitle
          title="Employee Recharge Performance"
          subtitle="C2C, SC and total recharge progress across the selected date range."
          icon="↗"
        />
        <div className="kit-metrics-grid">
          <OpsMetric tone="blue" label="C2C Target" value={money(totals.c2cT)} note="Selected range target" />
          <OpsMetric tone="green" label="C2C Achieved" value={money(totals.c2cA)} note="Stock lifting" />
          <OpsMetric
            tone="purple"
            label="C2C %"
            value={totals.c2cT ? `${((totals.c2cA / totals.c2cT) * 100).toFixed(1)}%` : "0%"}
            note="Achievement rate"
          />
          <OpsMetric
            tone="cyan"
            label="SC Achieved"
            value={money(totals.sc)}
            note="Included for fully covered months"
          />
          <OpsMetric tone="orange" label="Total Recharge" value={money(totals.trA)} note="C2C + SC" />
          <OpsMetric
            tone="rose"
            label="Monthly Transactions"
            value={totals.trx.toLocaleString()}
            note="Exact TRANSACTION_COUNT from source"
          />
        </div>
      </section>

      <OpsDataCard
        title="RSO Recharge Performance"
        subtitle="Target, achieved and progress by field employee."
        count={`${rows.length} employees`}
      >
        {rows.length ? (
          <OpsTable wide>
            <thead>
              <tr>
                <th>Supervisor</th>
                <th>Employee</th>
                <th>Retailers</th>
                <th>Transactions</th>
                <th>C2C Target</th>
                <th>C2C Achieved</th>
                <th>C2C Progress</th>
                <th>SC</th>
                <th>Recharge Target</th>
                <th>Recharge Achieved</th>
                <th>Total Progress</th>
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
                  <td>{money(r.c2cTarget)}</td>
                  <td>
                    <strong className="kit-num">{money(r.c2cAchieved)}</strong>
                  </td>
                  <td>
                    <ProgressCell value={r.c2cPercent} />
                  </td>
                  <td>
                    <span className="kit-num">{money(r.scAchieved)}</span>
                  </td>
                  <td>{money(r.totalRechargeTarget)}</td>
                  <td>
                    <strong className="kit-num">{money(r.totalRechargeAchieved)}</strong>
                  </td>
                  <td>
                    <ProgressCell value={r.totalRechargePercent} />
                  </td>
                </tr>
              ))}
            </tbody>
          </OpsTable>
        ) : (
          <EmptyState title="No C2C performance yet" subtitle="Upload C2C data to populate employee performance." />
        )}
      </OpsDataCard>

      <section>
        <OpsSectionTitle
          title={`Date-wise C2C · ${new Date(date + "T00:00:00").toLocaleDateString()}`}
          subtitle="Retailers that received balance on the selected day."
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
          <OpsMetric tone="blue" label="Selected Day Amount" value={money(dayTotal)} note="Total C2C distributed" />
          <OpsMetric
            tone="purple"
            label="Retailers Receiving Balance"
            value={dailyRows.length.toLocaleString()}
            note="Active recipients"
          />
        </div>
      </section>

      <OpsDataCard
        title="Retailer C2C"
        subtitle="Retailer-level balance distribution for the selected date."
        count={`${dailyRows.length} retailers`}
      >
        {dailyRows.length ? (
          <OpsTable>
            <thead>
              <tr>
                <th>Supervisor</th>
                <th>Employee</th>
                <th>Retailer</th>
                <th>Amount</th>
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
          <EmptyState title="No C2C on this date" subtitle={`No C2C amount stored for ${date}.`} />
        )}
      </OpsDataCard>

      <OpsDataCard
        title="Recent C2C Imports"
        subtitle="Latest uploaded Stock Lifting reports."
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
          <EmptyState title="No C2C imports yet" subtitle="Your recent C2C files will appear here." icon="⇧" />
        )}
      </OpsDataCard>
    </main>
  );
}
