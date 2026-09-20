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
  OpsLevelTabs,
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
import { groupOps, groupOpsBySupervisor, opsCountLabel, type OpsLevel } from "../../lib/ops-rollup";

type EmployeeRow = {
  employeeId: string;
  employeeCode?: string | null;
  name: string;
  rsoMsisdn: string;
  supervisorId: string;
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
  employeeId: string;
  employee: string;
  rsoMsisdn: string;
  supervisorId: string;
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

/*
 * Declared at module scope, not inside the component.
 *
 * A `const [...] as const` written in the body is a NEW array on every
 * render, so a `useMemo` that depends on it memoises nothing and eslint
 * says so. These are constants; this is where a constant lives.
 */
const DAY_FIELDS = ["total", "simSwap", "ga170", "ga300"] as const;
const MONTH_FIELDS = ["retailerCount", "ga170", "ga300", "gaTarget", "gaAchieved", "ssoAchieved", "ssoTarget"] as const;

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
  /*
   * Which level each of the two tables is showing.
   *
   * TWO pieces of state, not one, because the two cards are not the same
   * question. The retailer table is one DAY's activations; the performance
   * table is the MONTH against target. Putting both behind one switch would
   * let a reader carry a day's figure over to a monthly heading, which is the
   * "two numbers wearing one word" defect this project keeps finding.
   */
  const [dayLevel, setDayLevel] = useState<OpsLevel>("retailer");
  const [monthLevel, setMonthLevel] = useState<OpsLevel>("rso");
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

  /*
   * The day's activations, added up per RSO and per supervisor.
   *
   * Grouped on the CLIENT because the whole day is already here — unlike /ob,
   * whose retailer table is server-paged at fifty rows and whose roll-ups
   * therefore have to come from the server. Summing what is on screen is only
   * safe when what is on screen is everything.
   */
  const dayByRso = useMemo(
    () =>
      groupOps(
        retailerDaily,
        (r) => ({ key: r.employeeId, name: r.employee, sub: r.rsoMsisdn }),
        DAY_FIELDS,
        (r, f) => r[f],
      ),
    [retailerDaily],
  );
  const dayBySupervisor = useMemo(
    () => groupOpsBySupervisor(retailerDaily, DAY_FIELDS, (r, f) => r[f]),
    [retailerDaily],
  );
  /* The month, one level up. The rows are already one per RSO. */
  const monthBySupervisor = useMemo(() => groupOpsBySupervisor(rows, MONTH_FIELDS, (r, f) => r[f]), [rows]);

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
        title="GA for the selected day"
        subtitle={
          dayLevel === "retailer"
            ? "Retailer-wise activation for the selected day."
            : dayLevel === "rso"
              ? "The same day's activations added up under the RSO who owns each outlet."
              : "The same day's activations added up under each supervisor."
        }
        count={
          dayLevel === "retailer"
            ? opsCountLabel(retailerDaily.length, "retailer")
            : dayLevel === "rso"
              ? opsCountLabel(dayByRso.length, "RSO")
              : opsCountLabel(dayBySupervisor.length, "supervisor")
        }
        tabs={
          <OpsLevelTabs
            value={dayLevel}
            onChange={setDayLevel}
            counts={{ retailer: retailerDaily.length, rso: dayByRso.length, supervisor: dayBySupervisor.length }}
          />
        }
      >
        {dayLevel === "rso" && dayByRso.length ? (
          <OpsTable>
            <thead>
              <tr>
                <th>RSO</th>
                <th className="is-right">Retailers</th>
                <th className="is-right">Total GA</th>
                <th className="is-right">{GA_CATEGORY_LABEL.SIM_SWAP}</th>
                <th className="is-right">{GA_CATEGORY_LABEL.GA_170}</th>
                <th className="is-right">{GA_CATEGORY_LABEL.GA_300}</th>
              </tr>
            </thead>
            <tbody>
              {dayByRso.map((g) => (
                <tr key={g.key}>
                  <td>
                    <PersonCell name={g.name} sub={g.sub} />
                  </td>
                  <td className="is-right">
                    <span className="kit-count-pill">{g.count}</span>
                  </td>
                  <td className="is-right">
                    <strong>{g.totals.total.toLocaleString("en-US")}</strong>
                    <small>Standard GA only</small>
                  </td>
                  <td className="is-right">
                    <span className="kit-count-pill">{g.totals.simSwap.toLocaleString("en-US")}</span>
                  </td>
                  <td className="is-right">{g.totals.ga170.toLocaleString("en-US")}</td>
                  <td className="is-right">{g.totals.ga300.toLocaleString("en-US")}</td>
                </tr>
              ))}
            </tbody>
          </OpsTable>
        ) : null}

        {dayLevel === "supervisor" && dayBySupervisor.length ? (
          <OpsTable>
            <thead>
              <tr>
                <th>Supervisor</th>
                <th className="is-right">Retailers</th>
                <th className="is-right">Total GA</th>
                <th className="is-right">{GA_CATEGORY_LABEL.SIM_SWAP}</th>
                <th className="is-right">{GA_CATEGORY_LABEL.GA_170}</th>
                <th className="is-right">{GA_CATEGORY_LABEL.GA_300}</th>
              </tr>
            </thead>
            <tbody>
              {dayBySupervisor.map((g) => (
                <tr key={g.key}>
                  <td>
                    <PersonCell name={g.name} sub="Supervisor" />
                  </td>
                  <td className="is-right">
                    <span className="kit-count-pill">{g.count}</span>
                  </td>
                  <td className="is-right">
                    <strong>{g.totals.total.toLocaleString("en-US")}</strong>
                    <small>Standard GA only</small>
                  </td>
                  <td className="is-right">
                    <span className="kit-count-pill">{g.totals.simSwap.toLocaleString("en-US")}</span>
                  </td>
                  <td className="is-right">{g.totals.ga170.toLocaleString("en-US")}</td>
                  <td className="is-right">{g.totals.ga300.toLocaleString("en-US")}</td>
                </tr>
              ))}
            </tbody>
          </OpsTable>
        ) : null}

        {dayLevel === "retailer" && retailerDaily.length ? (
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
        ) : null}

        {retailerDaily.length ? null : (
          <EmptyState
            title="No GA for this day"
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
        title="Monthly performance"
        subtitle={
          monthLevel === "rso"
            ? "Monthly RSO performance overview."
            : "The same month, with each supervisor's RSOs added together."
        }
        count={
          monthLevel === "rso"
            ? opsCountLabel(rows.length, "RSO")
            : opsCountLabel(monthBySupervisor.length, "supervisor")
        }
        tabs={
          /* No retailer level here: this table is target-against-achievement,
             and a target is set per RSO and per BP, never per outlet. */
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
                <th className="is-right">RSOs</th>
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
              {monthBySupervisor.map((g) => (
                <tr key={g.key}>
                  <td>
                    <PersonCell name={g.name} sub="Supervisor" />
                  </td>
                  <td className="is-right">
                    <span className="kit-count-pill">{g.count}</span>
                  </td>
                  <td className="is-right">
                    <span className="kit-count-pill">{g.totals.retailerCount.toLocaleString("en-US")}</span>
                  </td>
                  <td className="is-right">{g.totals.ga170.toLocaleString("en-US")}</td>
                  <td className="is-right">{g.totals.ga300.toLocaleString("en-US")}</td>
                  <td className="is-right">{g.totals.gaTarget.toLocaleString("en-US")}</td>
                  <td className="is-right">
                    <strong>{g.totals.gaAchieved.toLocaleString("en-US")}</strong>
                  </td>
                  <td>
                    {/* Recomputed from the summed pair, not averaged from the
                        RSO percentages: the mean of eight percentages is not
                        the team's percentage unless every target is equal. */}
                    <ProgressCell
                      target={g.totals.gaTarget}
                      value={
                        g.totals.gaTarget ? Number(((g.totals.gaAchieved / g.totals.gaTarget) * 100).toFixed(1)) : 0
                      }
                    />
                  </td>
                  <td className="is-right">
                    <strong>{g.totals.ssoAchieved.toLocaleString("en-US")}</strong>
                    <small>of {g.totals.ssoTarget.toLocaleString("en-US")}</small>
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
                    <ProgressCell value={r.gaPercent} target={r.gaTarget} />
                  </td>
                  <td className="is-right">
                    <strong>{r.ssoAchieved}</strong>
                    <small>of {r.ssoTarget}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </OpsTable>
        ) : null}

        {rows.length ? null : (
          <EmptyState
            title="No monthly performance yet"
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
