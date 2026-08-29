"use client";

/**
 * BP assignment manager — migrated to the role-UI kit.
 *
 * Behaviour is unchanged: POST /api/admin/bp-assignments creates an
 * assignment (the API closes the RSO's previous active BP and moves any BP
 * login), PATCH with `active: false` ends one. The retailer list is filtered
 * to the selected RSO's own outlets before anything else, because a BP code
 * must belong to the RSO it is assigned under.
 */

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SaveNotice } from "../../components/AdminEmployeesUI";
import { Icon } from "../../components/icons";
import { Btn, Card, EmptyState, Field, Row, SectionHead, Table } from "../../components/Kit";
import type { Column } from "../../components/Kit";
import { dhakaTodayYmd } from "../../../lib/business-time";

type Emp = { id: string; name: string; rsoMsisdn: string; supervisor: string };
type Retailer = {
  id: string;
  code: string;
  name: string;
  employeeId: string;
  employee: string;
  rsoMsisdn: string;
};
type Current = {
  id: string;
  employeeId: string;
  employee: string;
  supervisor: string;
  retailerId: string;
  code: string;
  name: string;
  startDate: string;
  gaTarget: number;
  login: string;
  mobile: string;
};
type Hist = { id: string; employee: string; code: string; name: string; startDate: string; endDate: string };

/** The picker never renders more than this many options at once. */
const MAX_OPTIONS = 80;

export default function BpManager({
  employees,
  retailers,
  current,
  history,
}: {
  employees: Emp[];
  retailers: Retailer[];
  current: Current[];
  history: Hist[];
}) {
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState("");
  const [q, setQ] = useState("");
  const [retailerId, setRetailerId] = useState("");
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const today = dhakaTodayYmd();

  const selectedEmployee = employees.find((e) => e.id === employeeId);
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    return retailers.filter(
      (r) =>
        (!employeeId || r.employeeId === employeeId) &&
        (!s || `${r.code} ${r.name} ${r.employee}`.toLowerCase().includes(s)),
    );
  }, [q, employeeId, retailers]);
  const options = matches.slice(0, MAX_OPTIONS);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    setOk(false);
    const body = Object.fromEntries(new FormData(e.currentTarget));
    const r = await fetch("/api/admin/bp-assignments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) {
      setMessage(d.error || "Could not assign BP");
      return;
    }
    setOk(true);
    setMessage(d.transferredLogin ? `BP assigned. Existing BP login moved to ${d.code}.` : `BP assigned to ${d.code}.`);
    setRetailerId("");
    setQ("");
    router.refresh();
  }

  async function endAssignment(id: string) {
    if (!window.confirm("End this BP assignment?")) return;
    setMessage("");
    setOk(false);
    const r = await fetch("/api/admin/bp-assignments", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, active: false }),
    });
    const d = await r.json();
    if (!r.ok) {
      setMessage(d.error || "Could not end assignment");
      return;
    }
    setOk(true);
    setMessage("BP assignment ended.");
    router.refresh();
  }

  const historyColumns: Column<Hist>[] = [
    {
      key: "code",
      label: "BP Code",
      render: (x) => (
        <>
          <strong>{x.code}</strong>
          <small>{x.name || "Unnamed retailer"}</small>
        </>
      ),
    },
    { key: "employee", label: "RSO" },
    { key: "startDate", label: "From" },
    { key: "endDate", label: "To", render: (x) => x.endDate || "—" },
  ];

  return (
    <>
      <SectionHead
        title="Assign / change BP"
        sub="Choose the RSO first, then one of that RSO's retailer codes. A new assignment automatically closes the previous active BP for that RSO."
      />
      <form onSubmit={submit}>
        <Card className="kit-mb-20" padded="lg">
          <div className="kit-form-grid">
            <Field label="RSO / Employee">
              <select
                className="kit-select"
                name="employeeId"
                required
                value={employeeId}
                onChange={(e) => {
                  setEmployeeId(e.target.value);
                  setRetailerId("");
                  setQ("");
                }}
              >
                <option value="">Select RSO</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} · {e.rsoMsisdn} · {e.supervisor}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Effective from">
              <input className="kit-input" type="date" name="startDate" defaultValue={today} required />
            </Field>
            <Field label="BP GA target">
              <input className="kit-input" type="number" min="0" name="gaTarget" defaultValue="0" inputMode="numeric" />
            </Field>
            {/* Search and select are two controls, so they are two fields: a
                <label> points at its first control only, and the old single
                label left the select itself unnamed for a screen reader. */}
            <Field label="Find retailer">
              <input
                className="kit-input"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                disabled={!employeeId}
                placeholder={
                  selectedEmployee ? `Search ${selectedEmployee.name}'s retailer code or name` : "Select an RSO first"
                }
              />
            </Field>
            <Field
              label="Retailer code"
              hint={
                matches.length > MAX_OPTIONS
                  ? `first ${MAX_OPTIONS} of ${matches.length} — narrow the search`
                  : undefined
              }
            >
              <select
                className="kit-select"
                name="retailerId"
                required
                value={retailerId}
                onChange={(e) => setRetailerId(e.target.value)}
                disabled={!employeeId}
              >
                <option value="">Select retailer</option>
                {options.map((r) => (
                  <option value={r.id} key={r.id}>
                    {r.code} · {r.name || "Unnamed retailer"}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <SaveNotice message={message} ok={ok} />
          <div className="kit-form-actions">
            <Btn disabled={busy || !employeeId || !retailerId}>{busy ? "Assigning…" : "Assign BP"}</Btn>
          </div>
        </Card>
      </form>

      <SectionHead
        title="Current BP assignments"
        sub={`${current.length} ${current.length === 1 ? "assignment is" : "assignments are"} active.`}
      />
      <Card className="kit-mb-20" padded>
        {current.length ? (
          <div className="kit-rows">
            {current.map((x) => (
              <Row
                key={x.id}
                avatar={x.name || x.code}
                title={`${x.code} · ${x.name || "Unnamed retailer"}`}
                sub={`${x.employee} · ${x.supervisor} · Since ${x.startDate}`}
                detail={x.login ? `Login: ${x.login}${x.mobile ? ` · ${x.mobile}` : ""}` : "No BP login"}
                value={x.gaTarget ? x.gaTarget.toLocaleString() : "—"}
                valueSub="GA target"
                after={
                  <div className="kit-row-actions">
                    <Btn variant="danger" size="sm" type="button" onClick={() => endAssignment(x.id)}>
                      Change / End
                    </Btn>
                  </div>
                }
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No BP is assigned yet"
            hint="Assign a retailer code above to create the first BP."
            icon={<Icon name="shop" />}
          />
        )}
      </Card>

      <SectionHead
        title="Recent BP history"
        sub={history.length ? `Last ${history.length} closed, newest first.` : "Nothing closed yet."}
      />
      <Card padded>
        <Table
          columns={historyColumns}
          rows={history}
          empty={
            <EmptyState
              title="No BP change history"
              hint="Ended assignments will appear here."
              icon={<Icon name="calendar" />}
            />
          }
        />
      </Card>
    </>
  );
}
