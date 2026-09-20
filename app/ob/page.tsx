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
  EmptyState,
} from "../components/OperationsPremiumUI";
import { opsCountLabel, type OpsLevel } from "../../lib/ops-rollup";
import { Btn } from "../components/Kit";
import { apiFetch, apiUpload } from "@/lib/api-client";
import { fmtDate, fmtTime } from "../../lib/format";

type Row = {
  retailerCode: string;
  retailerName: string;
  employee: string;
  rsoMsisdn: string;
  supervisor: string;
  amount: number;
};
type Batch = {
  fileName: string;
  uploadedAt: string;
  businessDate?: string | null;
  totalRows: number;
  successRows: number;
  failedRows: number;
  status: string;
} | null;
/** The two payloads this page reads, as it reads them. */
type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
};
/** One RSO's share of the snapshot, rolled up on the server. */
type EmployeeRow = {
  key: string;
  name: string;
  sub: string;
  supervisorId: string;
  supervisor: string;
  count: number;
  amount: number;
};
/** One supervisor's, built from the RSO rows above. */
type SupervisorRow = { key: string; name: string; rsos: number; count: number; amount: number };
type ObSummary = {
  rows?: Row[];
  byEmployee?: EmployeeRow[];
  bySupervisor?: SupervisorRow[];
  batch?: Batch;
  snapshotDate?: string | null;
  pagination?: Pagination;
  retailerCount?: number;
  totalOpeningBalance?: number;
};
type ObImportResult = {
  snapshotDate?: string;
  successRows?: number;
  failedRows?: number;
  totalOpeningBalance?: number;
  assignmentWarnings?: number;
  /** Set when the file named outlets the Retailer Master did not have yet. */
  newRetailerNote?: string | null;
};

function money(n: number) {
  return new Intl.NumberFormat("en-BD", { maximumFractionDigits: 2 }).format(n);
}
export default function ObPage() {
  const canView = useCan("ob", "view");
  const canAdd = useCan("ob", "add");
  const [rows, setRows] = useState<Row[]>([]);
  const [batch, setBatch] = useState<Batch>(null);
  const [snapshotDate, setSnapshotDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [page, setPage] = useState(1);
  const [pageMeta, setPageMeta] = useState({
    page: 1,
    pageSize: 50,
    total: 0,
    totalPages: 1,
    hasNext: false,
    hasPrevious: false,
  });
  const [totalBalance, setTotalBalance] = useState(0);
  const [byEmployee, setByEmployee] = useState<EmployeeRow[]>([]);
  const [bySupervisor, setBySupervisor] = useState<SupervisorRow[]>([]);
  /*
   * Which level the table is showing.
   *
   * Retailer is the default because it is what the file contains and what this
   * page has always shown; the other two are the same snapshot added up.
   */
  const [level, setLevel] = useState<OpsLevel>("retailer");
  async function load(nextPage = page) {
    const res = await apiFetch<ObSummary>(`/api/ob/summary?page=${nextPage}&pageSize=50`, { cache: "no-store" });
    if (!res.ok) return setMessage(res.message);
    const d = res.data;
    setRows(d.rows || []);
    setBatch(d.batch || null);
    setSnapshotDate(d.snapshotDate || null);
    setPageMeta(
      d.pagination || {
        page: 1,
        pageSize: 50,
        total: d.retailerCount || 0,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
      },
    );
    setTotalBalance(Number(d.totalOpeningBalance || 0));
    setByEmployee(d.byEmployee || []);
    setBySupervisor(d.bySupervisor || []);
  }
  useEffect(() => {
    void load(page);
  }, [page]);
  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem("file") as HTMLInputElement;
    if (!input.files?.[0]) return;
    setLoading(true);
    setMessage("Replacing current Opening Balance snapshot...");
    const body = new FormData();
    body.append("file", input.files[0]);
    const res = await apiUpload<ObImportResult>("/api/import/OB", body);
    setLoading(false);
    if (!res.ok) return setMessage(res.message);
    const d = res.data;
    setMessage(
      `Opening Balance replaced for ${d.snapshotDate}. ${d.successRows} retailers mapped, ${d.failedRows} failed. Current total balance: ${money(d.totalOpeningBalance ?? 0)}.${d.assignmentWarnings ? ` ${d.assignmentWarnings} RSO assignment warning(s).` : ""}${d.newRetailerNote ? ` ${d.newRetailerNote}` : ""}`,
    );
    input.value = "";
    await load();
  }
  const total = useMemo(() => totalBalance, [totalBalance]);
  if (!canView) return null;
  return (
    <main className="page">
      <OpsHeader
        badge="OB"
        title="Opening Balance"
        subtitle="Maintain the latest retailer opening-balance snapshot with a clean replacement workflow."
      />

      {canAdd && (
        <OpsUpload
          title="Upload Latest OB File"
          subtitle="Replace the current retailer balance snapshot."
          sample="/api/samples/ob"
          message={message}
          rule={
            <>
              The report date is read from row 1. Only the latest retailer opening-balance snapshot is kept, and the
              previous snapshot is replaced after a successful import.
            </>
          }
        >
          <form method="post" onSubmit={upload} className="kit-upload-form">
            <label className="kit-file-field">
              <span>ITop_Up_Balance file</span>
              <small>Excel / TXT · max 20 MB</small>
              <input name="file" type="file" accept=".xls,.xlsx,.xlsm,.txt" required />
            </label>
            <Btn variant="primary" disabled={loading}>
              {loading ? "Replacing..." : "⇧  Upload & Replace OB"}
            </Btn>
          </form>
        </OpsUpload>
      )}

      <section>
        <OpsSectionTitle
          title="Current Balance Snapshot"
          subtitle="Latest stored opening balance across your retailer base."
        />
        <div className="kit-metrics-grid">
          <OpsMetric label="Snapshot Date" value={snapshotDate || "No data"} note="Latest report date" />
          <OpsMetric label="Retailers" value={pageMeta.total.toLocaleString("en-US")} note="Mapped outlets" />
          <OpsMetric label="Total Opening Balance" value={money(total)} note="Current total balance" />
          <OpsMetric
            label="Last Import"
            value={fmtDate(batch?.uploadedAt, "-")}
            note={batch ? fmtTime(batch.uploadedAt) : "No import yet"}
          />
        </div>
      </section>

      <OpsDataCard
        title="Opening Balance"
        subtitle={
          level === "retailer"
            ? "Latest balance by retailer and responsible field employee."
            : level === "rso"
              ? "Every retailer's balance added up under the RSO who owns the outlet."
              : "Every RSO's total added up under their supervisor."
        }
        count={
          level === "retailer"
            ? opsCountLabel(pageMeta.total, "retailer")
            : level === "rso"
              ? opsCountLabel(byEmployee.length, "RSO")
              : opsCountLabel(bySupervisor.length, "supervisor")
        }
        tabs={
          <OpsLevelTabs
            value={level}
            onChange={setLevel}
            counts={{ retailer: pageMeta.total, rso: byEmployee.length, supervisor: bySupervisor.length }}
          />
        }
      >
        {/*
          The roll-ups are whole and the retailer list is a page of fifty.

          That asymmetry is deliberate and is why the RSO and supervisor totals
          are computed on the server: adding up what happens to be on screen
          would total one page of the snapshot, which looks like an answer and
          is not one. So those two tabs carry no pager — there is nothing left
          to page through.
        */}
        {level === "retailer" &&
          (rows.length ? (
            <OpsTable>
              <thead>
                <tr>
                  <th>Supervisor</th>
                  <th>Employee</th>
                  <th>Retailer</th>
                  <th>Opening Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
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
            <EmptyState
              title="No opening balance yet"
              subtitle="Upload the latest OB file to populate retailer balances."
              icon="◫"
            />
          ))}

        {level === "rso" &&
          (byEmployee.length ? (
            <OpsTable>
              <thead>
                <tr>
                  <th>Supervisor</th>
                  <th>RSO</th>
                  <th>Retailers</th>
                  <th>Total Opening Balance</th>
                </tr>
              </thead>
              <tbody>
                {byEmployee.map((r) => (
                  <tr key={r.key}>
                    <td>
                      <PersonCell name={r.supervisor} />
                    </td>
                    <td>
                      <PersonCell name={r.name} sub={r.sub} />
                    </td>
                    <td className="kit-num">{r.count.toLocaleString("en-US")}</td>
                    <td>
                      <strong className="kit-num">৳{money(r.amount)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </OpsTable>
          ) : (
            <EmptyState
              title="No opening balance yet"
              subtitle="Upload the latest OB file to see each RSO's total."
              icon="◫"
            />
          ))}

        {level === "supervisor" &&
          (bySupervisor.length ? (
            <OpsTable>
              <thead>
                <tr>
                  <th>Supervisor</th>
                  <th>RSOs</th>
                  <th>Retailers</th>
                  <th>Total Opening Balance</th>
                </tr>
              </thead>
              <tbody>
                {bySupervisor.map((r) => (
                  <tr key={r.key}>
                    <td>
                      <PersonCell name={r.name} />
                    </td>
                    <td className="kit-num">{r.rsos.toLocaleString("en-US")}</td>
                    <td className="kit-num">{r.count.toLocaleString("en-US")}</td>
                    <td>
                      <strong className="kit-num">৳{money(r.amount)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </OpsTable>
          ) : (
            <EmptyState
              title="No opening balance yet"
              subtitle="Upload the latest OB file to see each team's total."
              icon="◫"
            />
          ))}

        {level === "retailer" && pageMeta.totalPages > 1 && (
          <div className="kit-pagination" aria-label="Opening Balance pages">
            <button type="button" disabled={!pageMeta.hasPrevious} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Previous
            </button>
            <span>
              Page {pageMeta.page} of {pageMeta.totalPages}
            </span>
            <button type="button" disabled={!pageMeta.hasNext} onClick={() => setPage((p) => p + 1)}>
              Next
            </button>
          </div>
        )}
      </OpsDataCard>
    </main>
  );
}
