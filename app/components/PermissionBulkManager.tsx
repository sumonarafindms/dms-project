"use client";

/**
 * Bulk permission tools — migrated to the role-UI kit.
 *
 * Two operations against /api/admin/permissions/bulk: apply a named preset to
 * the selected users, or copy one user's effective setup onto them. Both are
 * the API's semantics; this component only chooses who and which.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Check, Field, SectionHead } from "./Kit";
import { Icon } from "./icons";

type U = { id: string; name: string; role: string; mobile: string; custom: number };

export default function PermissionBulkManager({ users }: { users: U[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [role, setRole] = useState("ALL");
  const [preset, setPreset] = useState("ROLE_DEFAULT");
  const [sourceId, setSourceId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgTone, setMsgTone] = useState<"ok" | "bad">("ok");

  const visible = useMemo(() => users.filter((u) => role === "ALL" || u.role === role), [users, role]);
  const allVisibleSelected = visible.length > 0 && visible.every((u) => selected.includes(u.id));

  function toggle(id: string) {
    setSelected((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  }
  function toggleAll() {
    const ids = visible.map((x) => x.id);
    setSelected((v) =>
      ids.every((id) => v.includes(id)) ? v.filter((id) => !ids.includes(id)) : [...new Set([...v, ...ids])],
    );
  }
  function report(ok: boolean, text: string) {
    setMsgTone(ok ? "ok" : "bad");
    setMsg(text);
  }

  async function applyPreset() {
    if (!selected.length) return report(false, "Select at least one user.");
    setBusy(true);
    setMsg("");
    const r = await fetch("/api/admin/permissions/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "preset", userIds: selected, preset }),
    });
    const d = await r.json();
    setBusy(false);
    report(r.ok, r.ok ? `Updated ${d.updated} user(s).` : d.error || "Could not apply preset.");
    if (r.ok) router.refresh();
  }

  async function copy() {
    const targets = selected.filter((id) => id !== sourceId);
    if (!sourceId) return report(false, "Choose a source user.");
    if (!targets.length) return report(false, "Select at least one target user.");
    setBusy(true);
    setMsg("");
    const r = await fetch("/api/admin/permissions/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "copy", sourceId, targetIds: targets }),
    });
    const d = await r.json();
    setBusy(false);
    report(r.ok, r.ok ? `Copied permissions to ${d.updated} user(s).` : d.error || "Could not copy permissions.");
    if (r.ok) router.refresh();
  }

  return (
    <>
      <SectionHead
        title="Bulk permission manager"
        sub="Apply presets or copy one user's access to multiple accounts."
      />
      <Card className="kit-mb-20" padded="lg">
        <div className="kit-form-grid">
          <Field label="Filter by role">
            <select className="kit-select" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="ALL">All roles</option>
              {["MANAGER", "SUPERVISOR", "ACCOUNTS", "RSO", "BP"].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </Field>
          <div className="kit-bulk-count">
            <Check checked={allVisibleSelected} onChange={toggleAll} label="Select visible users" />
            <b>{selected.length} selected</b>
          </div>
        </div>

        <div className="kit-check-list kit-mt-12">
          {visible.map((u) => (
            <Check
              key={u.id}
              checked={selected.includes(u.id)}
              onChange={() => toggle(u.id)}
              label={u.name}
              sub={`${u.role} · ${u.mobile || "No mobile"} · ${u.custom ? `${u.custom} custom` : "Role default"}`}
            />
          ))}
          {!visible.length && <p className="kit-filter-note">No users in this role.</p>}
        </div>

        <div className="kit-form-grid kit-mt-16">
          <div>
            <Field label="Apply preset" hint="replaces effective access">
              <select className="kit-select" value={preset} onChange={(e) => setPreset(e.target.value)}>
                <option value="ROLE_DEFAULT">Role Default</option>
                <option value="VIEW_ONLY">View Only</option>
                <option value="DATA_OPERATOR">Data Operator</option>
                <option value="FULL_NON_ADMIN">Full Role Access</option>
              </select>
            </Field>
            <div className="kit-form-actions">
              <button type="button" className="kit-btn is-primary size-sm" disabled={busy} onClick={applyPreset}>
                Apply to selected
              </button>
            </div>
          </div>
          <div>
            <Field label="Copy from user" hint="copies their effective setup">
              <select className="kit-select" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                <option value="">Choose source user</option>
                {users.map((u) => (
                  <option value={u.id} key={u.id}>
                    {u.name} · {u.role}
                  </option>
                ))}
              </select>
            </Field>
            <div className="kit-form-actions">
              <button type="button" className="kit-btn is-secondary size-sm" disabled={busy} onClick={copy}>
                Copy to selected
              </button>
            </div>
          </div>
        </div>

        {msg && (
          <div className={`kit-note is-${msgTone} is-last`} role="status">
            <Icon name={msgTone === "ok" ? "check" : "alert"} />
            <span>{msg}</span>
          </div>
        )}
      </Card>
    </>
  );
}
