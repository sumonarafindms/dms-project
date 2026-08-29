"use client";

/**
 * Assign supervisors to a manager — migrated to the role-UI kit.
 *
 * The manager-side twin of SupervisorTeamEditor: same shape, different
 * endpoint (/api/admin/manager-team) and one level up the hierarchy.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Check, SectionHead } from "./Kit";
import { Icon } from "./icons";

export default function ManagerTeamEditor({
  managerId,
  supervisors,
  selected,
}: {
  managerId: string;
  supervisors: { id: string; name: string; meta: string }[];
  selected: string[];
}) {
  const router = useRouter(),
    [ids, setIds] = useState(selected),
    [q, setQ] = useState(""),
    [busy, setBusy] = useState(false),
    [msg, setMsg] = useState(""),
    [ok, setOk] = useState(true);
  const filtered = useMemo(
    () => supervisors.filter((x) => !q || `${x.name} ${x.meta}`.toLowerCase().includes(q.toLowerCase())),
    [supervisors, q],
  );
  function toggle(id: string) {
    setIds((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  }
  async function save() {
    setBusy(true);
    setMsg("");
    const r = await fetch("/api/admin/manager-team", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ managerId, supervisorIds: ids }),
    });
    const d = await r.json();
    setBusy(false);
    setOk(r.ok);
    if (!r.ok) return setMsg(d.error || "Could not update manager team");
    setMsg(`${d.count} supervisor assigned.`);
    router.refresh();
  }

  return (
    <>
      <SectionHead title="Assigned Supervisors" sub={`${ids.length} selected of ${supervisors.length}`} />
      <Card padded="lg">
        <div className="kit-search" style={{ marginBottom: "0.75rem" }}>
          <Icon name="search" />
          <input
            className="kit-input"
            placeholder="Search supervisor"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search supervisor"
          />
        </div>
        <div className="kit-check-list">
          {filtered.map((x) => (
            <Check key={x.id} checked={ids.includes(x.id)} onChange={() => toggle(x.id)} label={x.name} sub={x.meta} />
          ))}
          {!filtered.length && <p className="kit-filter-note">No supervisor matches that search.</p>}
        </div>
        {msg && (
          <div className={ok ? "kit-note is-ok" : "kit-note is-bad"} role="status" style={{ margin: "1rem 0 0" }}>
            <Icon name={ok ? "check" : "alert"} />
            <span>{msg}</span>
          </div>
        )}
        <div className="kit-form-actions">
          <button className="kit-btn is-primary size-md" type="button" disabled={busy} onClick={save}>
            {busy ? "Saving…" : "Save Supervisor Assignment"}
          </button>
        </div>
      </Card>
    </>
  );
}
