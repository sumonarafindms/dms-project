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
import { Btn, Card, Check, Field, LinkBtn, NumberInput, PageHeader } from "./Kit";
import { Icon } from "./icons";
import { PIN_LENGTH } from "../../lib/credential-policy";
import { apiSend } from "@/lib/api-client";
import { Picker } from "./Picker";

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
  const [retailerId, setRetailerId] = useState(initial.retailerId || "");
  const [supervisorId, setSupervisorId] = useState(initial.supervisorId || "");
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
    const r = await apiSend<{ id?: string }>(`/api/admin/employees/${role}`, edit ? "PATCH" : "POST", body);
    setBusy(false);
    if (!r.ok) {
      setMessage(r.message);
      return;
    }
    setOk(true);
    setMessage(edit ? "Changes saved successfully." : "Employee created successfully.");
    if (!edit && r.data.id) {
      router.push(`/admin/employees/${role}/${r.data.id}`);
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

      <form method="post" onSubmit={submit}>
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
                  <Picker
                    name="supervisorId"
                    placeholder="Unassigned — type to search"
                    options={supervisors.map((x) => ({ id: x.id, label: x.name, meta: x.meta }))}
                    value={supervisorId}
                    onChange={setSupervisorId}
                  />
                </Field>
              </>
            )}
            {role === "bps" && (
              <>
                {!edit ? (
                  <>
                    <Field label="RSO">
                      <Picker
                        name="employeeId"
                        required
                        placeholder="Search RSO by name, wallet or supervisor"
                        options={employees.map((x) => ({ id: x.id, label: x.name, meta: x.meta }))}
                        value={employeeId}
                        onChange={(id) => {
                          setEmployeeId(id);
                          // The retailer list is the chosen RSO's, so a retailer
                          // picked under the previous one has to go with it.
                          setRetailerId("");
                        }}
                      />
                    </Field>
                    <Field
                      label="Retailer Code"
                      hint={employeeId ? `${availableRetailers.length} under this RSO` : undefined}
                    >
                      <Picker
                        name="retailerId"
                        required
                        disabled={!employeeId}
                        placeholder={employeeId ? "Search retailer code or name" : "Select an RSO first"}
                        emptyText="No retailer under this RSO matches"
                        options={availableRetailers.map((x) => ({ id: x.id, label: x.name, meta: x.meta }))}
                        value={retailerId}
                        onChange={setRetailerId}
                      />
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
                  <NumberInput min="0" name="gaTarget" defaultValue={initial.gaTarget || 0} />
                </Field>
                <Field label="BP Display Name">
                  <input className="kit-input" name="name" defaultValue={initial.name || ""} />
                </Field>
              </>
            )}
          </div>
        </Card>

        <Card padded="lg">
          <h2 className="kit-label kit-mb-12">Login &amp; Access</h2>
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
                autoComplete="off"
                minLength={PIN_LENGTH}
                maxLength={PIN_LENGTH}
                pattern={`\\d{${PIN_LENGTH}}`}
                placeholder={edit ? `Leave blank to keep, or ${PIN_LENGTH} digits` : `${PIN_LENGTH} digits`}
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
            <Btn disabled={busy}>{busy ? "Saving…" : edit ? "Save Changes" : `Create ${title}`}</Btn>
            <LinkBtn variant="ghost" href={`/admin/employees/${role}`}>
              Cancel
            </LinkBtn>
          </div>
        </Card>
      </form>
    </main>
  );
}
