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

type EmployeeRow = {
  employeeId: string;
  employeeCode?: string | null;
  name: string;
  rsoMsisdn: string;
  supervisor: string;
  retailerCount: number;
  ga150: number;
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
  ga150: number;
  ga300: number;
  simSwap: number;
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
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
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
    const res = await fetch(`/api/ga/summary?${params.toString()}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || "Failed to load GA data");
      return;
    }
    setRows(data.rows || []);
    setRetailerDaily(data.retailerDaily || []);
    setHistory(data.importHistory || []);
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

    const res = await fetch("/api/import/GA", { method: "POST", body });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setMessage(data.error || "GA import failed");
      return;
    }

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
          ga150: a.ga150 + r.ga150,
          ga300: a.ga300 + r.ga300,
          ssoT: a.ssoT + r.ssoTarget,
          ssoA: a.ssoA + r.ssoAchieved,
        }),
        { target: 0, achieved: 0, ga150: 0, ga300: 0, ssoT: 0, ssoA: 0 },
      ),
    [rows],
  );

  const dayTotals = useMemo(
    () =>
      retailerDaily.reduce(
        (a, r) => ({ total: a.total + r.total, ga150: a.ga150 + r.ga150, ga300: a.ga300 + r.ga300 }),
        { total: 0, ga150: 0, ga300: 0 },
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
          <b>GA counting rule:</b> PRODUCT_CODE <b>MMST / MMSTs</b> = 300 SIM, <b>MMSTC</b> = 170 SIM. <b>SIMWAP</b>{" "}
          must have <b>SELLING_PRICE 350</b>; <b>EV-SWAP</b> must have <b>SELLING_PRICE 100</b>. Both are counted only
          under <b>SIM SWAP</b> and are excluded from GA achievement, GA target progress and SSO. SIM_NO still prevents
          duplicate import.
        </>
      }
    >
      <form onSubmit={upload} className="kit-upload-form">
        <label className="kit-file-field">
          <span>ActivationDetailsReport.xlsx</span>
          <small>Excel · max 20 MB</small>
          <input name="file" type="file" accept=".xlsx,.xlsm,.xls" required />
        </label>
        <button disabled={loading} className="kit-btn is-primary size-md">
          {loading ? "Processing…" : "Upload GA"}
        </button>
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
          value={dayTotals.total.toLocaleString()}
          note={`${dayTotals.ga150.toLocaleString()} + ${dayTotals.ga300.toLocaleString()} · standard GA only`}
        />
        <OpsMetric label="150" value={dayTotals.ga150.toLocaleString()} note="MMSTC · selling price 170" />
        <OpsMetric label="300" value={dayTotals.ga300.toLocaleString()} note="MMST / MMSTs" />
        <OpsMetric
          label="Active Retailers"
          value={activeGaRetailers.toLocaleString()}
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
                <th className="is-right">SIM SWAP</th>
                <th className="is-right">150</th>
                <th className="is-right">300</th>
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
                  <td className="is-right">{r.ga150}</td>
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
        <OpsMetric label="GA Target" value={totals.target.toLocaleString()} note="Monthly target" />
        <OpsMetric label="GA Achieved" value={totals.achieved.toLocaleString()} note="Completed GA" />
        <OpsMetric label="150" value={totals.ga150.toLocaleString()} note="Price = 170" />
        <OpsMetric label="300" value={totals.ga300.toLocaleString()} note="MMST / MMSTs" />
        <OpsMetric
          label="GA %"
          value={totals.target ? `${((totals.achieved / totals.target) * 100).toFixed(1)}%` : "0%"}
          note="Achievement rate"
        />
        <OpsMetric
          label="SSO"
          value={`${totals.ssoA.toLocaleString()} / ${totals.ssoT.toLocaleString()}`}
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
                <th className="is-right">150</th>
                <th className="is-right">300</th>
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
                  <td className="is-right">{r.ga150}</td>
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
                  <td>{new Date(h.uploadedAt).toLocaleString()}</td>
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
