"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useCan } from "../components/PermissionContext";
import { dhakaYesterdayYmd } from "../../lib/business-time";
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
import { Btn } from "../components/Kit";
import { apiFetch, apiUpload } from "@/lib/api-client";
import { fmtDate, fmtDateTime } from "../../lib/format";
import { GA_CATEGORY_LABEL } from "../../lib/ga-category";

type EmployeeRow = {
  employeeId: string;
  employeeCode?: string | null;
  name: string;
  rsoMsisdn: string;
  supervisor: string;
  retailerCount: number;
  ga170: number;
  ga300: number;
  gaAchieved: number;
  gaTarget: number;
  gaPercent: number;
  ssoAchieved: number;
  ssoTarget: number;
};

type RetailerDailyRow = {
  retailerCode: string;
  retailerName: string;
  employee: string;
  rsoMsisdn: string;
  supervisor: string;
  total: number;
  ga170: number;
  ga300: number;
  simSwap: number;
};

/** What /api/ga/summary and /api/import/GA send back, as this page reads them. */
type GaSummary = { rows?: EmployeeRow[]; retailerDaily?: RetailerDailyRow[]; importHistory?: History[] };
type GaImportResult = {
  duplicate?: boolean;
  businessDate?: string;
  reportStartDate?: string;
  reportEndDate?: string;
  insertedRows?: number;
  updatedRows?: number;
  duplicateRows?: number;
  failedRows?: number;
};

type History = {
  id: string;
  fileName: string;
  uploadedAt: string;
  businessDate?: string | null;
  totalRows: number;
  successRows: number;
  failedRows: number;
  duplicateRows: number;
  status: string;
};

function yesterday() {
  return dhakaYesterdayYmd();
}

function prettyDate(value?: string | null) {
  if (!value) return "-";
  // `value` back rather than "—" when it is not a date: an unparseable string
  // from the API is worth showing so somebody can see what arrived.
  return Number.isNaN(new Date(value).getTime()) ? value : fmtDate(value, "-");
}

export default function GaPage() {
  const canView = useCan("ga", "view");
  const canAdd = useCan("ga", "add");
  const [month, setMonth] = useState(() => yesterday().slice(0, 7));
  const [dataDate, setDataDate] = useState(yesterday());
  const [fromDate, setFromDate] = useState(() => `${yesterday().slice(0, 7)}-01`);
  const [toDate, setToDate] = useState(yesterday());
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [retailerDaily, setRetailerDaily] = useState<RetailerDailyRow[]>([]);
  const [history, setHistory] = useState<History[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function load(overrides?: { month?: string; date?: string; from?: string; to?: string }) {
    const nextMonth = overrides?.month || month,
      nextDate = overrides?.date || dataDate,
      nextFrom = overrides?.from || fromDate,
      nextTo = overrides?.to || toDate;
    const params = new URLSearchParams({
      month: `${nextMonth}-01`,
      date: nextDate,
      from: nextFrom,
      to: nextTo,
      _: String(Date.now()),
    });
    const res = await apiFetch<GaSummary>(`/api/ga/summary?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) {
      setMessage(res.message);
      return;
    }
    setRows(res.data.rows || []);
    setRetailerDaily(res.data.retailerDaily || []);
    setHistory(res.data.importHistory || []);
  }

  useEffect(() => {
    load();
  }, [month, dataDate, fromDate, toDate]);

  // Both handlers ignore an empty value. A native date input reports "" while the
  // user is still typing a date by hand, and it also reported "" for any date the
  // old min={fromDate} attribute rejected. Writing that "" into state cleared the
  // range without ever moving dataDate, so the daily table silently kept showing
  // the previously selected day — the "date select korle kaj hoi na" report.
  function changeFrom(value: string) {
    if (!value) return;
    setFromDate(value);
    if (value.length >= 7) setMonth(value.slice(0, 7));
    // Moving the start past the end drags the end (and the selected day) with it.
    if (toDate < value) {
      setToDate(value);
      setDataDate(value);
    }
  }
  function changeTo(value: string) {
    if (!value) return;
    setToDate(value);
    setDataDate(value);
    if (value.length >= 7) setMonth(value.slice(0, 7));
    // Picking a day before the current start used to be rejected outright by the
    // input's min attribute. Pull the start back instead, so every day the user
    // picks is always reachable.
    if (value < fromDate) setFromDate(value);
  }

  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const input = form.elements.namedItem("file") as HTMLInputElement;
    if (!input.files?.[0]) return;

    setLoading(true);
    setMessage("Uploading and checking activation data...");
    const body = new FormData();
    body.append("file", input.files[0]);

    const res = await apiUpload<GaImportResult>("/api/import/GA", body);
    setLoading(false);

    if (!res.ok) {
      setMessage(res.message);
      return;
    }
    const data = res.data;

    if (data.duplicate) {
      setMessage(`This exact file was already imported for ${prettyDate(data.businessDate)}. No GA was counted twice.`);
    } else {
      setMessage(
        `GA import complete ${data.reportStartDate} → ${data.reportEndDate}: ${data.insertedRows} new SIM, ${data.updatedRows} corrected SIM, ${data.duplicateRows} duplicate SIM ignored, ${data.failedRows} failed row(s).`,
      );
      if (data.reportStartDate && data.reportEndDate) {
        const nextMonth = data.reportEndDate.slice(0, 7);
        setDataDate(data.reportEndDate);
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
          target: a.target + r.gaTarget,
          achieved: a.achieved + r.gaAchieved,
          ga170: a.ga170 + r.ga170,
          ga300: a.ga300 + r.ga300,
          ssoT: a.ssoT + r.ssoTarget,
          ssoA: a.ssoA + r.ssoAchieved,
        }),
        { target: 0, achieved: 0, ga170: 0, ga300: 0, ssoT: 0, ssoA: 0 },
      ),
    [rows],
  );

  const dayTotals = useMemo(
    () =>
      retailerDaily.reduce(
        (a, r) => ({ total: a.total + r.total, ga170: a.ga170 + r.ga170, ga300: a.ga300 + r.ga300 }),
        { total: 0, ga170: 0, ga300: 0 },
      ),
    [retailerDaily],
  );
  const activeGaRetailers = useMemo(() => retailerDaily.filter((r) => r.total > 0).length, [retailerDaily]);

  const uploadPanel = canAdd ? (
    <OpsUpload
      title="Upload Activation Details"
      subtitle="Import one activation workbook containing one or many activation dates."
      sample="/api/samples/ga"
      message={message}
      rule={
        <>
          <b>GA counting rule:</b> PRODUCT_CODE decides everything. <b>MMST / MMSTs</b> = 300 SIM, <b>MMSTC</b> = 170
          SIM. <b>SIMWAP</b> and <b>EV-SWAP</b> are replacements: counted only under <b>SIM SWAP</b> and excluded from
          GA achievement, GA target progress and SSO. <b>SELLING_PRICE is stored but never validated</b> — a swap
          imports at whatever it cost that day, so a tariff change needs no change here. SIM_NO still prevents duplicate
          import.
        </>
      }
    >
      <form method="post" onSubmit={upload} className="kit-upload-form">
        <label className="kit-file-field">
          <span>ActivationDetailsReport.xlsx</span>
          <small>Excel · max 20 MB</small>
          <input name="file" type="file" accept=".xlsx,.xlsm,.xls" required />
        </label>
        <Btn disabled={loading}>{loading ? "Processing…" : "Upload GA"}</Btn>
      </form>
    </OpsUpload>
  ) : null;

  if (!canView) return null;
  return (
    <main className="page">
      {/* changeFrom / changeTo carry the v102 empty-value guards, so the range
          inputs stay wired to this page rather than to OpsHeader's own. */}
      <OpsHeader
        badge="GA"
        title="GA Activation Upload & SSO"
        subtitle="Upload one Activation Details report with one or many activation dates. Standard SIM sales count toward GA; replacement SIMs are tracked separately as SIM SWAP."
        from={fromDate}
        to={toDate}
        onFrom={changeFrom}
        onTo={changeTo}
      />

      <OpsFreshness
        label="GA"
        businessDate={history[0]?.businessDate}
        uploadedAt={history[0]?.uploadedAt}
        fileName={history[0]?.fileName}
        range={`${fromDate} → ${toDate}`}
      />

      {uploadPanel}

      <OpsSectionTitle
        title={`Selected day: ${prettyDate(dataDate)}`}
        subtitle="Daily activation snapshot — follows the To date above."
      />
      <div className="kit-metrics-grid">
        <OpsMetric
          label="Total GA"
          value={dayTotals.total.toLocaleString("en-US")}
          note={`${dayTotals.ga170.toLocaleString("en-US")} + ${dayTotals.ga300.toLocaleString("en-US")} · standard GA only`}
        />
        <OpsMetric label={GA_CATEGORY_LABEL.GA_170} value={dayTotals.ga170.toLocaleString("en-US")} note="MMSTC" />
        <OpsMetric
          label={GA_CATEGORY_LABEL.GA_300}
          value={dayTotals.ga300.toLocaleString("en-US")}
          note="MMST / MMSTS"
        />
        <OpsMetric
          label="Active Retailers"
          value={activeGaRetailers.toLocaleString("en-US")}
          note="Retailers with standard GA"
        />
      </div>

      <OpsDataCard
        title="Retailer GA"
        subtitle="Retailer-wise activation for the selected day."
        count={`${retailerDaily.length} retailers`}
      >
        {retailerDaily.length ? (
          <OpsTable>
            <thead>
              <tr>
                <th>Supervisor</th>
                <th>Employee</th>
                <th>Retailer</th>
                <th className="is-right">Total GA</th>
                <th className="is-right">{GA_CATEGORY_LABEL.SIM_SWAP}</th>
                <th className="is-right">{GA_CATEGORY_LABEL.GA_170}</th>
                <th className="is-right">{GA_CATEGORY_LABEL.GA_300}</th>
              </tr>
            </thead>
            <tbody>
              {retailerDaily.map((r) => (
                <tr key={r.retailerCode}>
                  <td>
                    <PersonCell name={r.supervisor} sub="Supervisor" />
                  </td>
                  <td>
                    <PersonCell name={r.employee} sub={r.rsoMsisdn} />
                  </td>
                  <td>
                    <b>{r.retailerCode}</b>
                    <small>{r.retailerName}</small>
                  </td>
                  <td className="is-right">
                    <strong>{r.total}</strong>
                    <small>Standard GA only</small>
                  </td>
                  <td className="is-right">
                    <span className="kit-count-pill" title="SIMWAP + EV-SWAP; excluded from Total GA">
                      {r.simSwap}
                    </span>
                  </td>
                  <td className="is-right">{r.ga170}</td>
                  <td className="is-right">{r.ga300}</td>
                </tr>
              ))}
            </tbody>
          </OpsTable>
        ) : (
          <EmptyState
            title="No retailer GA yet"
            subtitle={`No GA data stored for ${prettyDate(dataDate)}.`}
            icon="sim"
          />
        )}
      </OpsDataCard>

      <OpsSectionTitle
        title="Monthly employee performance"
        subtitle="Standard GA only. SIMWAP / EV-SWAP are excluded from every employee and target total."
      />
      <div className="kit-metrics-grid">
        <OpsMetric label="GA Target" value={totals.target.toLocaleString("en-US")} note="Monthly target" />
        <OpsMetric label="GA Achieved" value={totals.achieved.toLocaleString("en-US")} note="Completed GA" />
        <OpsMetric label={GA_CATEGORY_LABEL.GA_170} value={totals.ga170.toLocaleString("en-US")} note="MMSTC" />
        <OpsMetric label={GA_CATEGORY_LABEL.GA_300} value={totals.ga300.toLocaleString("en-US")} note="MMST / MMSTS" />
        <OpsMetric
          label="GA %"
          value={totals.target ? `${((totals.achieved / totals.target) * 100).toFixed(1)}%` : "0%"}
          note="Achievement rate"
        />
        <OpsMetric
          label="SSO"
          value={`${totals.ssoA.toLocaleString("en-US")} / ${totals.ssoT.toLocaleString("en-US")}`}
          note="Achieved / target"
        />
      </div>

      <OpsDataCard
        title="Employee performance"
        subtitle="Monthly RSO performance overview."
        count={`${rows.length} employees`}
      >
        {rows.length ? (
          <OpsTable>
            <thead>
              <tr>
                <th>Supervisor</th>
                <th>Employee</th>
                <th className="is-right">Retailers</th>
                <th className="is-right">{GA_CATEGORY_LABEL.GA_170}</th>
                <th className="is-right">{GA_CATEGORY_LABEL.GA_300}</th>
                <th className="is-right">GA Target</th>
                <th className="is-right">GA Achieved</th>
                <th>GA Progress</th>
                <th className="is-right">SSO</th>
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
                  <td className="is-right">
                    <span className="kit-count-pill">{r.retailerCount}</span>
                  </td>
                  <td className="is-right">{r.ga170}</td>
                  <td className="is-right">{r.ga300}</td>
                  <td className="is-right">{r.gaTarget}</td>
                  <td className="is-right">
                    <strong>{r.gaAchieved}</strong>
                  </td>
                  <td>
                    <ProgressCell value={r.gaPercent} />
                  </td>
                  <td className="is-right">
                    <strong>{r.ssoAchieved}</strong>
                    <small>of {r.ssoTarget}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </OpsTable>
        ) : (
          <EmptyState
            title="No employee performance yet"
            subtitle="Upload an activation file to populate monthly GA performance."
            icon="chart"
          />
        )}
      </OpsDataCard>

      <OpsDataCard
        title="Recent GA imports"
        subtitle="Latest activation files and import results."
        count={`${history.length} imports`}
      >
        {history.length ? (
          <OpsTable>
            <thead>
              <tr>
                <th>Data Date</th>
                <th>File</th>
                <th>Uploaded</th>
                <th className="is-right">Saved / Total</th>
                <th className="is-right">Duplicates</th>
                <th className="is-right">Failed</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td>
                    <b>{prettyDate(h.businessDate)}</b>
                  </td>
                  <td>{h.fileName}</td>
                  <td>{fmtDateTime(h.uploadedAt)}</td>
                  <td className="is-right">
                    <strong>
                      {h.successRows}/{h.totalRows}
                    </strong>
                  </td>
                  <td className="is-right">{h.duplicateRows}</td>
                  <td className="is-right">{h.failedRows}</td>
                  <td>
                    <StatusPill value={h.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </OpsTable>
        ) : (
          <EmptyState title="No imports yet" subtitle="Your recent GA uploads will appear here." icon="upload" />
        )}
      </OpsDataCard>
    </main>
  );
}
