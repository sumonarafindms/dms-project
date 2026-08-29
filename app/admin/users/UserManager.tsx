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
import {
  Badge,
  Card,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  Row,
  SectionHead,
  SummaryStrip,
} from "../../components/Kit";

type Opt = { id: string; name: string; meta?: string };
type U = {
  id: string;
  displayName: string;
  mobileNumber: string | null;
  role: string;
  active: boolean;
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
    const r = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!r.ok) {
      setMsgTone("bad");
      return setMsg(d.error || "Could not create user");
    }
    setMsgTone("ok");
    setMsg("User created successfully.");
    form.reset();
    router.refresh();
  }

  async function toggle(id: string, active: boolean) {
    const r = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, active }),
    });
    const d = await r.json();
    if (!r.ok) {
      setMsgTone("bad");
      setMsg(d.error || "Could not update account");
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
      const r = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) {
        setMsgTone("bad");
        setMsg(d.error || "Could not update account");
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
        <select className="kit-select" name={spec.name} required defaultValue={current ?? ""} key={`${spec.name}-${r}`}>
          <option value="">{spec.placeholder}</option>
          {spec.options.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
              {x.meta ? ` · ${x.meta}` : ""}
            </option>
          ))}
        </select>
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
          { label: "Total Accounts", value: users.length.toLocaleString() },
          { label: "Active", value: activeCount.toLocaleString(), tone: "teal" },
          { label: "Disabled", value: (users.length - activeCount).toLocaleString(), tone: "amber" },
          { label: "Roles", value: new Set(users.map((u) => u.role)).size.toLocaleString() },
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
        <form onSubmit={create}>
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
              <input className="kit-input" name="pin" required minLength={4} inputMode="numeric" type="password" />
            </Field>
            {linkField(role)}
          </div>
          <div className="kit-form-actions">
            <button className="kit-btn is-primary size-md">Create Login</button>
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
                detail={u.link || "System account"}
                after={
                  <div className="kit-row-actions">
                    {/* Status is shown, not clicked. The old row made the status
                        pill itself the toggle, so the label named the current
                        state while the click did the opposite. */}
                    <Badge tone={u.active ? "active" : "inactive"}>{u.active ? "Active" : "Disabled"}</Badge>
                    <button type="button" className="kit-btn is-secondary size-sm" onClick={() => setEditing(u)}>
                      <Icon name="edit" /> Edit / PIN
                    </button>
                    <ConfirmActionButton
                      className={`kit-btn size-sm ${u.active ? "is-danger" : "is-secondary"}`}
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
              <button type="button" className="kit-btn is-ghost size-md" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button form="edit-login-form" disabled={saving} className="kit-btn is-primary size-md">
                {saving ? "Saving…" : "Save changes"}
              </button>
            </>
          }
        >
          <form id="edit-login-form" onSubmit={saveEdit}>
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
                  minLength={4}
                  inputMode="numeric"
                  type="password"
                  placeholder="Leave blank to keep current PIN"
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
