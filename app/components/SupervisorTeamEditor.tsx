"use client";

/**
 * Assign RSOs to a supervisor — migrated to the role-UI kit.
 *
 * Sits under AdminEmployeeForm on the supervisor edit page, so it uses the
 * same kit surfaces; the whole selection is PATCHed at once to
 * /api/admin/supervisor-team, which is what makes it a save button rather
 * than a per-row toggle.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Check, SectionHead } from "./Kit";
import { Icon } from "./icons";

export default function SupervisorTeamEditor({
  supervisorId,
  employees,
  selected,
}: {
  supervisorId: string;
  employees: { id: string; name: string; meta: string }[];
  selected: string[];
}) {
  const router = useRouter(),
    [ids, setIds] = useState(selected),
    [q, setQ] = useState(""),
    [busy, setBusy] = useState(false),
    [msg, setMsg] = useState(""),
    [ok, setOk] = useState(true);
  const filtered = useMemo(
    () => employees.filter((x) => !q || `${x.name} ${x.meta}`.toLowerCase().includes(q.toLowerCase())),
    [employees, q],
  );
  function toggle(id: string) {
    setIds((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  }
  async function save() {
    setBusy(true);
    setMsg("");
    const r = await fetch("/api/admin/supervisor-team", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ supervisorId, rsoIds: ids }),
    });
    const d = await r.json();
    setBusy(false);
    setOk(r.ok);
    if (!r.ok) return setMsg(d.error || "Could not update team");
    setMsg(`${d.count} RSO assigned.`);
    router.refresh();
  }

  return (
    <>
      <SectionHead title="Assigned RSOs" sub={`${ids.length} selected of ${employees.length}`} />
      <Card padded="lg">
        <div className="kit-search" style={{ marginBottom: "0.75rem" }}>
          <Icon name="search" />
          <input
            className="kit-input"
            placeholder="Search RSO"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search RSO"
          />
        </div>
        <div className="kit-check-list">
          {filtered.map((x) => (
            <Check key={x.id} checked={ids.includes(x.id)} onChange={() => toggle(x.id)} label={x.name} sub={x.meta} />
          ))}
          {!filtered.length && <p className="kit-filter-note">No RSO matches that search.</p>}
        </div>
        {msg && (
          <div className={ok ? "kit-note is-ok" : "kit-note is-bad"} role="status" style={{ margin: "1rem 0 0" }}>
            <Icon name={ok ? "check" : "alert"} />
            <span>{msg}</span>
          </div>
        )}
        <div className="kit-form-actions">
          <button className="kit-btn is-primary size-md" type="button" disabled={busy} onClick={save}>
            {busy ? "Saving…" : "Save RSO Assignment"}
          </button>
        </div>
      </Card>
    </>
  );
}
