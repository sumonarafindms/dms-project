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
import { useConfirm } from "../../components/Feedback";
import { SaveNotice } from "../../components/AdminEmployeesUI";
import { Icon } from "../../components/icons";
import { Btn, Card, EmptyState, Field, NumberInput, Row, SectionHead, Table } from "../../components/Kit";
import type { Column } from "../../components/Kit";
import { dhakaTodayYmd } from "../../../lib/business-time";
import { apiSend } from "@/lib/api-client";
import { Picker } from "../../components/Picker";

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
  const confirm = useConfirm();
  const [employeeId, setEmployeeId] = useState("");
  const [retailerId, setRetailerId] = useState("");
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const today = dhakaTodayYmd();

  const selectedEmployee = employees.find((e) => e.id === employeeId);
  /* Only this RSO's codes. The searching itself is the picker's job now. */
  const mine = useMemo(
    () => retailers.filter((r) => !employeeId || r.employeeId === employeeId),
    [employeeId, retailers],
  );

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    setOk(false);
    const body = Object.fromEntries(new FormData(e.currentTarget));
    const r = await apiSend<{ updated?: boolean; code?: string }>("/api/admin/bp-assignments", "POST", body);
    setBusy(false);
    if (!r.ok) {
      setMessage(r.message);
      return;
    }
    const d = r.data;
    setOk(true);
    // No more "existing BP login moved": adding a BP no longer ends this RSO's
    // previous one, so nothing is moved. `updated` distinguishes editing an
    // assignment that already existed from creating a new one, which is the
    // only thing the person needs told apart.
    setMessage(
      d.updated
        ? `Assignment for ${d.code} updated.`
        : `BP assigned to ${d.code}. This RSO's other BP assignments are unchanged.`,
    );
    setRetailerId("");
    router.refresh();
  }

  async function endAssignment(id: string) {
    if (
      !(await confirm({
        title: "End this BP assignment?",
        body: "The outlet stops counting for this RSO from today. Its history stays.",
        confirmLabel: "End assignment",
        danger: true,
      }))
    )
      return;
    setMessage("");
    setOk(false);
    const r = await apiSend("/api/admin/bp-assignments", "PATCH", { id, active: false });
    if (!r.ok) {
      setMessage(r.message);
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
      <form method="post" onSubmit={submit}>
        <Card className="kit-mb-20" padded="lg">
          <div className="kit-form-grid">
            <Field label="RSO / Employee">
              <Picker
                name="employeeId"
                required
                placeholder="Search RSO by name, wallet or supervisor"
                options={employees.map((e) => ({ id: e.id, label: e.name, meta: `${e.rsoMsisdn} · ${e.supervisor}` }))}
                value={employeeId}
                onChange={(id) => {
                  setEmployeeId(id);
                  setRetailerId("");
                }}
              />
            </Field>
            <Field label="Effective from">
              <input className="kit-input" type="date" name="startDate" defaultValue={today} required />
            </Field>
            <Field label="BP GA target">
              <NumberInput min="0" name="gaTarget" defaultValue="0" />
            </Field>
            {/* The name this outlet is shown under wherever it appears as a
                BP. Optional: left blank, every screen falls back to the
                master file's retailer name. See lib/bp-name.ts. */}
            <Field label="BP display name" hint="Optional — defaults to the retailer name">
              <input className="kit-input" name="bpName" placeholder="What to call this BP" />
            </Field>
            {/* One control, not two. This screen used to carry a "Find
                retailer" text box beside the select because a native menu of
                this RSO's codes could not be searched; the picker does both,
                so the pair is gone and the same component now serves every
                long list in the app. */}
            <Field label="Retailer code" hint={employeeId ? `${mine.length} under this RSO` : undefined}>
              <Picker
                name="retailerId"
                required
                disabled={!employeeId}
                placeholder={
                  selectedEmployee ? `Search ${selectedEmployee.name}'s retailer code or name` : "Select an RSO first"
                }
                emptyText="No retailer under this RSO matches"
                options={mine.map((r) => ({ id: r.id, label: r.code, meta: r.name || "Unnamed retailer" }))}
                value={retailerId}
                onChange={setRetailerId}
              />
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
                value={x.gaTarget ? x.gaTarget.toLocaleString("en-US") : "—"}
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
