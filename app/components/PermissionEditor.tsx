"use client";

/**
 * Per-user module permissions — migrated to the role-UI kit.
 *
 * The matrix is four independent flags per module (view / add / edit /
 * update). Add, Edit and Update are meaningless without View, so unchecking
 * View clears the other three here and they are disabled while it is off —
 * the same rule lib/permissions.ts applies on the server.
 *
 * The presets below only change local state; nothing is written until Save.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, Check, EmptyState, PageHeader, Skeleton } from "./Kit";
import { Icon } from "./icons";

type Perm = "view" | "add" | "edit" | "update";
type Row = { key: string; label: string; group: string } & Record<Perm, boolean>;
const PERMS: Perm[] = ["view", "add", "edit", "update"];

export default function PermissionEditor({ userId, name, role }: { userId: string; name: string; role: string }) {
  const [rows, setRows] = useState<Row[]>([]),
    [busy, setBusy] = useState(true),
    [loaded, setLoaded] = useState(false),
    [msg, setMsg] = useState(""),
    [msgTone, setMsgTone] = useState<"ok" | "bad">("ok");

  useEffect(() => {
    fetch(`/api/admin/permissions/${userId}`)
      .then((r) => r.json())
      .then((d) => {
        setRows(d.modules || []);
        setBusy(false);
        setLoaded(true);
      });
  }, [userId]);

  function change(i: number, key: Perm, value: boolean) {
    setRows((v) =>
      v.map((r, n) =>
        n === i
          ? { ...r, [key]: value, ...(key === "view" && !value ? { add: false, edit: false, update: false } : {}) }
          : r,
      ),
    );
  }

  function localPreset(type: "VIEW_ONLY" | "DATA_OPERATOR" | "FULL") {
    const writable = new Set(["retailers", "targets", "ga", "c2c", "c2s", "ob", "bp"]);
    setRows((v) =>
      v.map((r) =>
        type === "VIEW_ONLY"
          ? { ...r, view: true, add: false, edit: false, update: false }
          : type === "FULL"
            ? { ...r, view: true, add: true, edit: true, update: true }
            : writable.has(r.key)
              ? { ...r, view: true, add: true, edit: true, update: true }
              : { ...r, view: true, add: false, edit: false, update: false },
      ),
    );
  }

  async function save() {
    setBusy(true);
    setMsg("");
    const r = await fetch(`/api/admin/permissions/${userId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        permissions: rows.map((x) => ({ module: x.key, view: x.view, add: x.add, edit: x.edit, update: x.update })),
      }),
    });
    setBusy(false);
    setMsgTone(r.ok ? "ok" : "bad");
    setMsg(r.ok ? "Permissions saved." : "Could not save permissions.");
  }

  async function reset() {
    if (!confirm("Reset this user to role-default permissions?")) return;
    setBusy(true);
    await fetch(`/api/admin/permissions/${userId}`, { method: "DELETE" });
    location.reload();
  }

  return (
    <main className="page">
      <Link href="/admin/permissions" className="kit-detail-back">
        <Icon name="arrow" /> Permissions Center
      </Link>
      <PageHeader title={name} subtitle={`${role} · Individual module access`} />

      <Card className="kit-mb-20" padded>
        <p className="kit-filter-note kit-mb-10">
          <Icon name="shield" /> View controls visibility. Add, Edit and Update only take effect when View is on.
        </p>
        <div className="kit-form-actions is-flush">
          <button type="button" className="kit-btn is-secondary size-sm" onClick={() => localPreset("VIEW_ONLY")}>
            View Only
          </button>
          <button type="button" className="kit-btn is-secondary size-sm" onClick={() => localPreset("DATA_OPERATOR")}>
            Data Operator
          </button>
          <button type="button" className="kit-btn is-secondary size-sm" onClick={() => localPreset("FULL")}>
            Full Access
          </button>
        </div>
      </Card>

      <Card className="kit-mb-20" padded>
        {!loaded ? (
          <div className="kit-rows">
            {[1, 2, 3, 4, 5].map((i) => (
              <div className="kit-row" key={i}>
                <Skeleton className="kit-skel-row" />
              </div>
            ))}
          </div>
        ) : rows.length ? (
          <div className="kit-matrix">
            <div className="kit-matrix-head" aria-hidden="true">
              <span>Module</span>
              {PERMS.map((k) => (
                <span key={k}>{k}</span>
              ))}
            </div>
            {rows.map((r, i) => (
              <div className="kit-matrix-row" key={r.key}>
                <div className="kit-matrix-name">
                  <strong>{r.label}</strong>
                  <small>{r.group}</small>
                </div>
                {PERMS.map((k) => (
                  <div className="kit-matrix-cell" key={k}>
                    {/* The header is hidden from assistive tech, so each box
                        carries its own name rather than relying on column
                        position. */}
                    <span className="kit-matrix-cell-label">{k}</span>
                    <Check
                      checked={r[k]}
                      disabled={busy || (k !== "view" && !r.view)}
                      onChange={(next) => change(i, k, next)}
                      label={<span className="kit-sr-only">{`${k} ${r.label}`}</span>}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No modules returned"
            hint="The permission catalogue could not be loaded for this account."
            icon={<Icon name="shield" />}
          />
        )}
      </Card>

      {msg && (
        <div className={`kit-note is-${msgTone}`} role="status">
          <Icon name={msgTone === "ok" ? "check" : "alert"} />
          <span>{msg}</span>
        </div>
      )}

      <div className="kit-form-actions is-flush">
        <button className="kit-btn is-primary size-md" disabled={busy} onClick={save}>
          {busy ? "Working…" : "Save Permissions"}
        </button>
        <button className="kit-btn is-ghost size-md" disabled={busy} onClick={reset}>
          Reset to Role Default
        </button>
      </div>
    </main>
  );
}
