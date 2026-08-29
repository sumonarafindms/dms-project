"use client";

/**
 * Add / edit form for all four employee roles — migrated to the role-UI kit.
 *
 * One form, four shapes. Which fields appear is driven entirely by `role`;
 * the API contract (`/api/admin/employees/<role>`, POST to create, PATCH to
 * edit) is unchanged.
 */

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SaveNotice } from "./AdminEmployeesUI";
import { dhakaTodayYmd } from "../../lib/business-time";
import { Card, Check, Field, PageHeader } from "./Kit";
import { Icon } from "./icons";

type Option = { id: string; name: string; meta?: string; employeeId?: string };
type Initial = {
  id?: string;
  name?: string;
  mobile?: string;
  active?: boolean;
  rsoMsisdn?: string;
  employeeCode?: string;
  supervisorId?: string;
  employeeId?: string;
  retailerId?: string;
  startDate?: string;
  gaTarget?: number;
};

export default function AdminEmployeeForm({
  role,
  initial = {},
  supervisors = [],
  employees = [],
  retailers = [],
}: {
  role: "managers" | "supervisors" | "rsos" | "bps";
  initial?: Initial;
  supervisors?: Option[];
  employees?: Option[];
  retailers?: Option[];
}) {
  const router = useRouter(),
    edit = Boolean(initial.id);
  const [employeeId, setEmployeeId] = useState(initial.employeeId || "");
  const [active, setActive] = useState(initial.active !== false);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [ok, setOk] = useState(false);
  const availableRetailers = useMemo(
    () => retailers.filter((r) => !employeeId || r.employeeId === employeeId),
    [retailers, employeeId],
  );

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    setOk(false);
    const fd = new FormData(e.currentTarget),
      body: Record<string, unknown> = Object.fromEntries(fd.entries());
    body.active = active;
    if (edit) body.id = initial.id;
    const r = await fetch(`/api/admin/employees/${role}`, {
      method: edit ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) {
      setMessage(d.error || "Could not save");
      return;
    }
    setOk(true);
    setMessage(edit ? "Changes saved successfully." : "Employee created successfully.");
    if (!edit && d.id) {
      router.push(`/admin/employees/${role}/${d.id}`);
      router.refresh();
    } else router.refresh();
  }

  const title =
    role === "managers" ? "Manager" : role === "supervisors" ? "Supervisor" : role === "rsos" ? "RSO" : "BP";

  return (
    <main className="page">
      <Link href={`/admin/employees/${role}`} className="kit-detail-back">
        <Icon name="arrow" /> {title}s
      </Link>
      <PageHeader
        title={edit ? `Edit ${title}` : `Add ${title}`}
        subtitle={
          role === "bps"
            ? "Assign a retailer code under an RSO and optionally create the BP mobile login."
            : "Manage employee identity, hierarchy and login access."
        }
      />

      <form onSubmit={submit}>
        <Card className="kit-mb-20" padded="lg">
          <div className="kit-form-grid">
            {role !== "bps" && (
              <Field label={`${title} Name`}>
                <input className="kit-input" name="name" required defaultValue={initial.name || ""} />
              </Field>
            )}
            {role === "rsos" && (
              <>
                <Field label="RSO MSISDN">
                  <input
                    className="kit-input"
                    name="rsoMsisdn"
                    required
                    defaultValue={initial.rsoMsisdn || ""}
                    inputMode="numeric"
                  />
                </Field>
                <Field label="Employee / RSO Code">
                  <input className="kit-input" name="employeeCode" defaultValue={initial.employeeCode || ""} />
                </Field>
                <Field label="Supervisor">
                  <select className="kit-select" name="supervisorId" defaultValue={initial.supervisorId || ""}>
                    <option value="">Unassigned</option>
                    {supervisors.map((x) => (
                      <option value={x.id} key={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            )}
            {role === "bps" && (
              <>
                {!edit ? (
                  <>
                    <Field label="RSO">
                      <select
                        className="kit-select"
                        name="employeeId"
                        required
                        value={employeeId}
                        onChange={(e) => setEmployeeId(e.target.value)}
                      >
                        <option value="">Select RSO</option>
                        {employees.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                            {x.meta ? ` · ${x.meta}` : ""}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Retailer Code">
                      <select className="kit-select" name="retailerId" required defaultValue={initial.retailerId || ""}>
                        <option value="">Select retailer</option>
                        {availableRetailers.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                            {x.meta ? ` · ${x.meta}` : ""}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Effective From">
                      <input
                        className="kit-input"
                        type="date"
                        name="startDate"
                        required
                        defaultValue={initial.startDate || dhakaTodayYmd()}
                      />
                    </Field>
                  </>
                ) : (
                  <Field label="BP Assignment" wide>
                    <div className="kit-readonly">
                      <strong>{initial.name || "Current BP assignment"}</strong>
                      <span>To change retailer code, create a new BP assignment.</span>
                    </div>
                  </Field>
                )}
                <Field label="BP GA Target">
                  <input
                    className="kit-input"
                    type="number"
                    min="0"
                    name="gaTarget"
                    defaultValue={initial.gaTarget || 0}
                  />
                </Field>
                <Field label="BP Display Name">
                  <input className="kit-input" name="name" defaultValue={initial.name || ""} />
                </Field>
              </>
            )}
          </div>
        </Card>

        <Card padded="lg">
          <h2 className="kit-label kit-mb-12">
            Login &amp; Access
          </h2>
          <div className="kit-form-grid">
            <Field label="Mobile Number">
              <input
                className="kit-input"
                name="mobile"
                defaultValue={initial.mobile || ""}
                inputMode="tel"
                placeholder={edit ? "Keep current or enter a new number" : "Optional for Supervisor/RSO/BP"}
              />
            </Field>
            <Field label={edit ? "New PIN" : "PIN"} hint={edit ? "optional" : undefined}>
              <input
                className="kit-input"
                name="pin"
                type="password"
                inputMode="numeric"
                minLength={4}
                placeholder={edit ? "Leave blank to keep current PIN" : "Minimum 4 characters"}
                required={role === "managers" && !edit}
              />
            </Field>
          </div>
          <div className="kit-mt-14">
            <Check
              checked={active}
              onChange={setActive}
              label="Active"
              sub="User can be assigned and access the DMS when a login exists."
            />
          </div>
          <div className="kit-guide">
            <strong>{title} setup</strong>
            <p>
              {role === "bps"
                ? "BP is tied to a retailer code and RSO assignment. Use a new assignment when the BP code changes."
                : "Keep hierarchy and login data aligned so role dashboards show the correct team."}
            </p>
            <ol>
              <li>Confirm identity and hierarchy.</li>
              <li>Add mobile + PIN only when a login is required.</li>
              <li>Review active status before saving.</li>
            </ol>
            <p>Changing a PIN or disabling an account revokes active sessions.</p>
          </div>
          <SaveNotice message={message} ok={ok} />
          <div className="kit-form-actions">
            <button className="kit-btn is-primary size-md" disabled={busy}>
              {busy ? "Saving…" : edit ? "Save Changes" : `Create ${title}`}
            </button>
            <Link className="kit-btn is-ghost size-md" href={`/admin/employees/${role}`}>
              Cancel
            </Link>
          </div>
        </Card>
      </form>
    </main>
  );
}
