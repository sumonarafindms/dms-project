"use client";

/**
 * Authorized Users — migrated to the role-UI kit.
 *
 * Three parts, unchanged in behaviour: create a login, browse the directory,
 * and edit one account in a dialog. Every write still goes through
 * /api/admin/users (POST to create, PATCH to update or toggle), and the
 * role-linking rules (RSO → employee, SUPERVISOR → supervisor, BP → retailer)
 * are the API's, not this component's.
 */

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import ConfirmActionButton from "../../components/ConfirmActionButton";
import { Icon } from "../../components/icons";
import { PIN_LENGTH } from "../../../lib/credential-policy";
import {
  Badge,
  Btn,
  Card,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  Row,
  SectionHead,
  SummaryStrip,
} from "../../components/Kit";
import { apiSend } from "@/lib/api-client";
import { Picker } from "../../components/Picker";
import { fmtDateTime } from "../../../lib/format";

type Opt = { id: string; name: string; meta?: string };
type U = {
  id: string;
  displayName: string;
  mobileNumber: string | null;
  role: string;
  active: boolean;
  /** ISO string when the login locked itself out, or null. */
  lockedAt: string | null;
  failedLoginCount: number;
  employeeId?: string | null;
  supervisorId?: string | null;
  bpRetailerId?: string | null;
  link: string;
};
const ROLES = ["IT", "MANAGER", "SUPERVISOR", "ACCOUNTS", "RSO", "BP"];

export default function UserManager({
  users,
  employees,
  supervisors,
  bps,
}: {
  users: U[];
  employees: Opt[];
  supervisors: Opt[];
  bps: Opt[];
}) {
  const router = useRouter();
  const [role, setRole] = useState("RSO");
  const [msg, setMsg] = useState("");
  const [msgTone, setMsgTone] = useState<"ok" | "bad">("ok");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<U | null>(null);
  const [saving, setSaving] = useState(false);

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg("");
    setMsgTone("ok");
    const form = e.currentTarget;
    const f = new FormData(form);
    const body: Record<string, unknown> = Object.fromEntries(f);
    body.role = role;
    const r = await apiSend("/api/admin/users", "POST", body);
    if (!r.ok) {
      setMsgTone("bad");
      return setMsg(r.message);
    }
    setMsgTone("ok");
    setMsg("User created successfully.");
    form.reset();
    router.refresh();
  }

  /**
   * Clear a lockout.
   *
   * Sends `unlock: true` rather than reusing the PIN field, because unlocking
   * and resetting a PIN are different decisions: most lockouts are the real
   * person mistyping, and making the admin invent a new PIN to let them back in
   * would mean a phone call to read it out every time.
   */
  async function unlock(u: U) {
    const r = await apiSend("/api/admin/users", "PATCH", { id: u.id, unlock: true });
    if (!r.ok) {
      setMsgTone("bad");
      setMsg(r.message);
      return;
    }
    setMsgTone("ok");
    setMsg(`${u.displayName} can sign in again.`);
    router.refresh();
  }

  async function toggle(id: string, active: boolean) {
    const r = await apiSend("/api/admin/users", "PATCH", { id, active });
    if (!r.ok) {
      setMsgTone("bad");
      setMsg(r.message);
      return;
    }
    router.refresh();
  }

  async function saveEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    setMsg("");
    const f = new FormData(e.currentTarget);
    const body: Record<string, unknown> = Object.fromEntries(f);
    body.id = editing.id;
    try {
      const r = await apiSend("/api/admin/users", "PATCH", body);
      if (!r.ok) {
        setMsgTone("bad");
        setMsg(r.message);
        return;
      }
      setMsgTone("ok");
      setMsg("Account updated successfully. Active sessions were refreshed where required.");
      setEditing(null);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const needle = q.toLowerCase();
  const filtered = users.filter(
    (u) => !q || `${u.displayName} ${u.mobileNumber || ""} ${u.role} ${u.link}`.toLowerCase().includes(needle),
  );
  const editRole = editing?.role || "";
  const activeCount = users.filter((u) => u.active).length;
  const lockedCount = users.filter((u) => u.lockedAt).length;

  /** The link selector shown for a role, or null when that role links to nothing. */
  const linkField = (r: string, current?: string | null) => {
    const spec =
      r === "RSO"
        ? { name: "employeeId", label: "Link RSO employee", placeholder: "Select RSO", options: employees }
        : r === "SUPERVISOR"
          ? { name: "supervisorId", label: "Link supervisor", placeholder: "Select supervisor", options: supervisors }
          : r === "BP"
            ? {
                name: "bpRetailerId",
                label: "Link assigned BP retailer",
                placeholder: "Select active BP",
                options: bps,
              }
            : null;
    if (!spec) return null;
    return (
      <Field label={spec.label} wide>
        {/* A picker, not a menu: these are the same hundreds-long lists of RSOs,
            supervisors and BP retailers that the Add BP form had to be scrolled
            through. `key` remounts it when the role changes so the previous
            role's selection cannot survive into a field it does not belong to. */}
        <Picker
          key={`${spec.name}-${r}`}
          name={spec.name}
          required
          placeholder={`${spec.placeholder} — type to search`}
          options={spec.options.map((x) => ({ id: x.id, label: x.name, meta: x.meta }))}
          defaultValue={current ?? ""}
        />
      </Field>
    );
  };

  return (
    <main className="page">
      <PageHeader
        title="Authorized Users"
        subtitle="Create and edit mobile/PIN logins, update role mappings and control account status."
      />

      <SummaryStrip
        items={[
          { label: "Total Accounts", value: users.length.toLocaleString("en-US") },
          { label: "Active", value: activeCount.toLocaleString("en-US"), tone: "brand" },
          { label: "Disabled", value: (users.length - activeCount).toLocaleString("en-US"), tone: "amber" },
          { label: "Locked out", value: lockedCount.toLocaleString("en-US"), tone: lockedCount ? "amber" : undefined },
        ]}
      />

      {msg && (
        <div className={`kit-note is-${msgTone}`} role="status">
          <Icon name={msgTone === "ok" ? "check" : "alert"} />
          <span>{msg}</span>
        </div>
      )}

      <SectionHead title="Create authorized account" sub="Mobile + PIN access linked to the correct DMS role." />
      <Card className="kit-mb-20" padded="lg">
        <form method="post" onSubmit={create}>
          <div className="kit-form-grid">
            <Field label="Role">
              <select className="kit-select" value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLES.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
            <Field label="Display name">
              <input className="kit-input" name="displayName" required />
            </Field>
            <Field label="Mobile number">
              <input className="kit-input" name="mobileNumber" required inputMode="tel" />
            </Field>
            <Field label="PIN">
              <input
                className="kit-input"
                name="pin"
                required
                minLength={PIN_LENGTH}
                maxLength={PIN_LENGTH}
                pattern={`\\d{${PIN_LENGTH}}`}
                inputMode="numeric"
                autoComplete="off"
                type="password"
                placeholder={`${PIN_LENGTH} digits`}
              />
            </Field>
            {linkField(role)}
          </div>
          <div className="kit-form-actions">
            <Btn>Create Login</Btn>
            <span className="kit-filter-note">PIN resets and deactivation revoke active sessions automatically.</span>
          </div>
        </form>
      </Card>

      <SectionHead
        title={`${users.length} login accounts`}
        sub={`${activeCount} active · ${users.length - activeCount} disabled`}
      />
      <div className="kit-filter-bar no-print">
        <div className="kit-search">
          <Icon name="search" />
          <input
            className="kit-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name, mobile, role or linked record"
            autoComplete="off"
            aria-label="Search users"
          />
        </div>
        <span className="kit-filter-note">{filtered.length} results</span>
      </div>

      <Card padded>
        {filtered.length ? (
          <div className="kit-rows">
            {filtered.map((u) => (
              <Row
                key={u.id}
                avatar={u.displayName}
                title={u.displayName}
                sub={`${u.role} · ${u.mobileNumber || "Admin login"}`}
                detail={
                  u.lockedAt
                    ? `Locked after ${u.failedLoginCount} failed sign-ins · ${fmtDateTime(u.lockedAt)}`
                    : u.link || "System account"
                }
                after={
                  <div className="kit-row-actions">
                    {/* Status is shown, not clicked. The old row made the status
                        pill itself the toggle, so the label named the current
                        state while the click did the opposite. */}
                    {u.lockedAt ? <Badge tone="failed">Locked</Badge> : null}
                    <Badge tone={u.active ? "active" : "inactive"}>{u.active ? "Active" : "Disabled"}</Badge>
                    {u.lockedAt ? (
                      <ConfirmActionButton
                        size="sm"
                        message={`Unlock ${u.displayName}? They will be able to sign in with their existing PIN.`}
                        onConfirm={() => unlock(u)}
                      >
                        <Icon name="check" /> Unlock
                      </ConfirmActionButton>
                    ) : null}
                    <Btn variant="secondary" size="sm" type="button" onClick={() => setEditing(u)}>
                      <Icon name="edit" /> Edit / PIN
                    </Btn>
                    <ConfirmActionButton
                      size="sm"
                      variant={u.active ? "danger" : "secondary"}
                      message={
                        u.active
                          ? `Disable login for ${u.displayName}? Active sessions will be revoked.`
                          : `Enable login for ${u.displayName}?`
                      }
                      onConfirm={() => toggle(u.id, !u.active)}
                    >
                      {u.active ? "Disable" : "Enable"}
                    </ConfirmActionButton>
                  </div>
                }
              />
            ))}
          </div>
        ) : (
          <EmptyState title="No matching accounts" hint="Try a different search term." icon={<Icon name="search" />} />
        )}
      </Card>

      {editing && (
        <Modal
          title="Edit login account"
          sub="Update account details, role mapping or set a new PIN."
          onClose={() => setEditing(null)}
          labelledBy="edit-login-title"
          footer={
            <>
              <Btn variant="ghost" type="button" onClick={() => setEditing(null)}>
                Cancel
              </Btn>
              <Btn form="edit-login-form" disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </Btn>
            </>
          }
        >
          <form method="post" id="edit-login-form" onSubmit={saveEdit}>
            <div className="kit-form-grid">
              <Field label="Display name">
                <input className="kit-input" name="displayName" defaultValue={editing.displayName} required />
              </Field>
              <Field label="Mobile number">
                <input
                  className="kit-input"
                  name="mobileNumber"
                  defaultValue={editing.mobileNumber || ""}
                  required
                  inputMode="tel"
                />
              </Field>
              <Field label="Role">
                <select
                  className="kit-select"
                  name="role"
                  value={editing.role}
                  onChange={(e) => setEditing({ ...editing, role: e.target.value })}
                >
                  {ROLES.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </Field>
              <Field label="New PIN" hint="optional">
                <input
                  className="kit-input"
                  name="pin"
                  minLength={PIN_LENGTH}
                  maxLength={PIN_LENGTH}
                  pattern={`\\d{${PIN_LENGTH}}`}
                  inputMode="numeric"
                  autoComplete="off"
                  type="password"
                  placeholder={`Leave blank to keep, or ${PIN_LENGTH} digits`}
                />
              </Field>
              {linkField(
                editRole,
                editRole === "RSO"
                  ? editing.employeeId
                  : editRole === "SUPERVISOR"
                    ? editing.supervisorId
                    : editing.bpRetailerId,
              )}
            </div>
            <div className="kit-guide">
              <strong>PIN security</strong>
              <p>
                If a new PIN, role, mobile number or mapping is changed, existing sessions for this account will be
                signed out.
              </p>
            </div>
          </form>
        </Modal>
      )}
    </main>
  );
}
