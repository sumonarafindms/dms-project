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
  OpsLevelTabs,
  PersonCell,
  ProgressCell,
  EmptyState,
  StatusPill,
  OpsFreshness,
} from "../components/OperationsPremiumUI";
import { Btn } from "../components/Kit";
import { dhakaTodayYmd } from "../../lib/business-time";
import { apiFetch, apiUpload } from "@/lib/api-client";
import { fmtDate, fmtDateTime } from "../../lib/format";
import { groupOps, groupOpsBySupervisor, opsCountLabel, type OpsLevel } from "../../lib/ops-rollup";

type Row = {
  employeeId: string;
  employeeCode?: string | null;
  name: string;
  rsoMsisdn: string;
  supervisorId: string;
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
  employeeId: string;
  employee: string;
  rsoMsisdn: string;
  supervisorId: string;
  supervisor: string;
  amount: number;
};
/** The two payloads this page reads, as it reads them. */
type SummaryPayload = { rows?: Row[]; dailyRows?: DailyRow[]; importHistory?: History[] };
type ImportPayload = {
  duplicate?: boolean;
  reportStartDate?: string;
  reportEndDate?: string;
  successRows?: number;
  failedRows?: number;
  dailyRecordsStored?: number;
  assignmentWarnings?: number;
  /** Set when the file named outlets the Retailer Master did not have yet. */
  newRetailerNote?: string | null;
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
/*
 * Declared at module scope, not inside the component.
 *
 * A `const [...] as const` written in the body is a NEW array on every
 * render, so a `useMemo` that depends on it memoises nothing and eslint
 * says so. These are constants; this is where a constant lives.
 */
const DAY_FIELDS = ["amount"] as const;
const MONTH_FIELDS = ["retailerCount", "transactionCount", "c2sAmount", "lsoTarget", "lsoAchieved"] as const;

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
  /* Two switches, two periods — see app/ga/page.tsx. */
  const [monthLevel, setMonthLevel] = useState<OpsLevel>("rso");
  const [dayLevel, setDayLevel] = useState<OpsLevel>("retailer");
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
    const res = await apiFetch<SummaryPayload>(`/api/c2s/summary?${p}`, { cache: "no-store" });
    if (!res.ok) return setMessage(res.message);
    setRows(res.data.rows || []);
    setDailyRows(res.data.dailyRows || []);
    setHistory(res.data.importHistory || []);
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
    const res = await apiUpload<ImportPayload>("/api/import/C2S", body);
    setLoading(false);
    if (!res.ok) return setMessage(res.message);
    const data = res.data;
    if (data.duplicate) setMessage("This exact C2S file was already imported. Nothing was counted twice.");
    else {
      setMessage(
        `C2S updated ${data.reportStartDate} → ${data.reportEndDate}. ${data.successRows} retailers mapped, ${data.failedRows} failed, ${data.dailyRecordsStored} non-zero retailer/day sales stored.${data.assignmentWarnings ? ` ${data.assignmentWarnings} RSO assignment mismatch warning(s).` : ""}${data.newRetailerNote ? ` ${data.newRetailerNote}` : ""}`,
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
  const dayByRso = useMemo(
    () =>
      groupOps(
        dailyRows,
        (r) => ({ key: r.employeeId, name: r.employee, sub: r.rsoMsisdn }),
        DAY_FIELDS,
        (r, f) => r[f],
      ),
    [dailyRows],
  );
  const dayBySupervisor = useMemo(() => groupOpsBySupervisor(dailyRows, DAY_FIELDS, (r, f) => r[f]), [dailyRows]);
  const monthBySupervisor = useMemo(() => groupOpsBySupervisor(rows, MONTH_FIELDS, (r, f) => r[f]), [rows]);
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
          <form method="post" onSubmit={upload} className="kit-upload-form">
            <label className="kit-file-field">
              <span>ITop_Up_Sales file</span>
              <small>Excel / TXT · max 20 MB</small>
              <input name="file" type="file" accept=".xls,.xlsx,.xlsm,.txt" required />
            </label>
            <Btn disabled={loading}>{loading ? "Processing..." : "⇧  Upload C2S"}</Btn>
          </form>
        </OpsUpload>
      )}

      <section>
        <OpsSectionTitle
          title="Employee LSO Performance"
          subtitle="Retail sales and LSO execution across the selected range."
        />
        <div className="kit-metrics-grid">
          <OpsMetric label="C2S Sales" value={money(totals.amount)} note="Retail sales amount" />
          <OpsMetric
            label="Monthly Transactions"
            value={totals.trx.toLocaleString("en-US")}
            note="Exact TRANSACTION_COUNT from source"
          />
          <OpsMetric label="LSO Target" value={totals.lsoT.toLocaleString("en-US")} note="Monthly target" />
          <OpsMetric label="LSO Achieved" value={totals.lsoA.toLocaleString("en-US")} note="Completed outlets" />
          <OpsMetric
            label="LSO %"
            value={totals.lsoT ? `${((totals.lsoA / totals.lsoT) * 100).toFixed(1)}%` : "0%"}
            note="Achievement rate"
          />
        </div>
      </section>

      <OpsDataCard
        title="LSO Performance"
        subtitle={
          monthLevel === "rso"
            ? "Employee-level C2S sales and LSO completion."
            : "The same period, with each supervisor's RSOs added together."
        }
        count={
          monthLevel === "rso"
            ? opsCountLabel(rows.length, "RSO")
            : opsCountLabel(monthBySupervisor.length, "supervisor")
        }
        tabs={
          <OpsLevelTabs
            value={monthLevel}
            onChange={setMonthLevel}
            levels={["rso", "supervisor"]}
            counts={{ rso: rows.length, supervisor: monthBySupervisor.length }}
          />
        }
      >
        {monthLevel === "supervisor" && monthBySupervisor.length ? (
          <OpsTable>
            <thead>
              <tr>
                <th>Supervisor</th>
                <th>RSOs</th>
                <th>Retailers</th>
                <th>Transactions</th>
                <th>C2S Amount</th>
                <th>LSO Target</th>
                <th>LSO Achieved</th>
                <th>LSO Progress</th>
              </tr>
            </thead>
            <tbody>
              {monthBySupervisor.map((g) => (
                <tr key={g.key}>
                  <td>
                    <PersonCell name={g.name} sub="Supervisor" />
                  </td>
                  <td>
                    <span className="kit-count-pill">{g.count}</span>
                  </td>
                  <td>
                    <span className="kit-count-pill">{g.totals.retailerCount.toLocaleString("en-US")}</span>
                  </td>
                  <td>{g.totals.transactionCount.toLocaleString("en-US")}</td>
                  <td>
                    <strong className="kit-num">৳{money(g.totals.c2sAmount)}</strong>
                  </td>
                  <td>{g.totals.lsoTarget.toLocaleString("en-US")}</td>
                  <td>
                    <strong className="kit-num">{g.totals.lsoAchieved.toLocaleString("en-US")}</strong>
                  </td>
                  <td>
                    {/* From the summed pair, not the mean of the RSOs' own
                        percentages — those are only equal when every target
                        is. */}
                    <ProgressCell
                      target={g.totals.lsoTarget}
                      value={
                        g.totals.lsoTarget ? Number(((g.totals.lsoAchieved / g.totals.lsoTarget) * 100).toFixed(1)) : 0
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </OpsTable>
        ) : null}

        {monthLevel === "rso" && rows.length ? (
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
                    <ProgressCell value={r.lsoPercent} target={r.lsoTarget} />
                  </td>
                </tr>
              ))}
            </tbody>
          </OpsTable>
        ) : null}

        {rows.length ? null : (
          <EmptyState title="No C2S performance yet" subtitle="Upload C2S data to populate employee LSO performance." />
        )}
      </OpsDataCard>

      <section>
        <OpsSectionTitle
          title={`Date-wise C2S · ${fmtDate(`${date}T00:00:00Z`)}`}
          subtitle="Retailers with customer sales on the selected day."
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
          <OpsMetric label="Selected Day Sales" value={money(dayTotal)} note="Customer sales amount" />
          <OpsMetric
            label="Retailers Selling"
            value={dailyRows.length.toLocaleString("en-US")}
            note="Active selling outlets"
          />
        </div>
      </section>

      <OpsDataCard
        title="C2S on this date"
        subtitle={
          dayLevel === "retailer"
            ? "Retailer-level sales for the selected date."
            : dayLevel === "rso"
              ? "The same date's sales added up under the RSO who owns each outlet."
              : "The same date's sales added up under each supervisor."
        }
        count={
          dayLevel === "retailer"
            ? opsCountLabel(dailyRows.length, "retailer")
            : dayLevel === "rso"
              ? opsCountLabel(dayByRso.length, "RSO")
              : opsCountLabel(dayBySupervisor.length, "supervisor")
        }
        tabs={
          <OpsLevelTabs
            value={dayLevel}
            onChange={setDayLevel}
            counts={{ retailer: dailyRows.length, rso: dayByRso.length, supervisor: dayBySupervisor.length }}
          />
        }
      >
        {dayLevel !== "retailer" && (dayLevel === "rso" ? dayByRso : dayBySupervisor).length ? (
          <OpsTable>
            <thead>
              <tr>
                <th>{dayLevel === "rso" ? "RSO" : "Supervisor"}</th>
                <th>Retailers</th>
                <th>Sales Amount</th>
              </tr>
            </thead>
            <tbody>
              {(dayLevel === "rso" ? dayByRso : dayBySupervisor).map((g) => (
                <tr key={g.key}>
                  <td>
                    <PersonCell name={g.name} sub={dayLevel === "rso" ? g.sub : "Supervisor"} />
                  </td>
                  <td>
                    <span className="kit-count-pill">{g.count}</span>
                  </td>
                  <td>
                    <strong className="kit-num">৳{money(g.totals.amount)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </OpsTable>
        ) : null}

        {dayLevel === "retailer" && dailyRows.length ? (
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
        ) : null}

        {dailyRows.length ? null : (
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
                    <b>{fmtDate(h.businessDate, "-")}</b>
                  </td>
                  <td>{h.fileName}</td>
                  <td>{fmtDateTime(h.uploadedAt)}</td>
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
