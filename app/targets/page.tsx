"use client";

import { useEffect, useMemo, useState } from "react";

type TargetRow = {
  employeeId: string;
  employeeCode: string | null;
  rsoMsisdn: string;
  name: string;
  supervisor: string;
  retailerCount: number;
  gaTarget: number;
  c2cTarget: number;
  scTarget: number;
  totalRechargeTarget: number;
  ssoTarget: number;
  lsoTarget: number;
  scAchieved: number;
};

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

const numericFields: Array<keyof Pick<TargetRow, "gaTarget" | "c2cTarget" | "scTarget" | "totalRechargeTarget" | "ssoTarget" | "lsoTarget" | "scAchieved">> = [
  "gaTarget", "c2cTarget", "scTarget", "totalRechargeTarget", "ssoTarget", "lsoTarget", "scAchieved",
];

export default function TargetsPage() {
  const [month, setMonth] = useState(currentMonth());
  const [rows, setRows] = useState<TargetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true);
    setMessage("");
    const response = await fetch(`/api/targets?month=${month}`, { cache: "no-store" });
    if (response.ok) {
      const data = await response.json();
      setRows(data.rows);
    } else setMessage("Could not load targets.");
    setLoading(false);
  }

  useEffect(() => { void load(); }, [month]);

  function update(index: number, field: typeof numericFields[number], value: string) {
    const number = Math.max(0, Number(value) || 0);
    setRows((previous) => previous.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      const changed = { ...row, [field]: number };
      if ((field === "c2cTarget" || field === "scTarget") && (!row.totalRechargeTarget || row.totalRechargeTarget === row.c2cTarget + row.scTarget)) {
        changed.totalRechargeTarget = (field === "c2cTarget" ? number : row.c2cTarget) + (field === "scTarget" ? number : row.scTarget);
      }
      return changed;
    }));
  }

  async function save() {
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/targets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month, rows }),
    });
    const data = await response.json();
    setMessage(response.ok ? `Saved ${data.saved} employee records for ${month}.` : `Error: ${data.error ?? "Save failed"}`);
    setSaving(false);
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => [row.name, row.employeeCode ?? "", row.rsoMsisdn, row.supervisor].some((value) => value.toLowerCase().includes(q)));
  }, [rows, search]);

  const totals = useMemo(() => rows.reduce((sum, row) => ({
    ga: sum.ga + row.gaTarget,
    c2c: sum.c2c + row.c2cTarget,
    sc: sum.sc + row.scTarget,
    recharge: sum.recharge + row.totalRechargeTarget,
    sso: sum.sso + row.ssoTarget,
    lso: sum.lso + row.lsoTarget,
  }), { ga: 0, c2c: 0, sc: 0, recharge: 0, sso: 0, lso: 0 }), [rows]);

  return (
    <main style={styles.main}>
      <div style={styles.topbar}>
        <div><h1 style={{ margin: 0 }}>Monthly Targets</h1><p style={styles.muted}>Company targets + manual SC achievement by employee</p></div>
        <nav style={{ display: "flex", gap: 14 }}><a href="/master-data" style={styles.link}>Master Data</a><a href="/dashboard" style={styles.link}>Dashboard</a></nav>
      </div>

      <section style={{ ...styles.panel, marginTop: 20 }}>
        <div style={styles.controls}>
          <label style={styles.label}>Month<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} style={styles.input} /></label>
          <label style={{ ...styles.label, flex: 1 }}>Search<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Employee / RSO / Supervisor" style={styles.input} /></label>
          <button onClick={save} disabled={loading || saving || !rows.length} style={styles.button}>{saving ? "Saving..." : "Save Targets"}</button>
        </div>
        {message && <p style={{ marginBottom: 0 }}>{message}</p>}
      </section>

      <div style={styles.cards}>
        {[["GA Target", totals.ga], ["C2C Target", totals.c2c], ["SC Target", totals.sc], ["Total Recharge", totals.recharge], ["SSO Target", totals.sso], ["LSO Target", totals.lso]].map(([label, value]) => (
          <div key={String(label)} style={styles.card}><div style={styles.muted}>{label}</div><strong style={{ fontSize: 24 }}>{loading ? "…" : Number(value).toLocaleString()}</strong></div>
        ))}
      </div>

      <section style={{ ...styles.panel, overflowX: "auto" }}>
        <p style={{ ...styles.muted, marginTop: 0 }}>C2C + SC changes automatically suggest Total Recharge target. You can still overwrite Total Recharge if the company sends a separate target.</p>
        <table style={styles.table}>
          <thead><tr><th>RSO</th><th>Employee</th><th>Supervisor</th><th>Retailers</th><th>GA Target</th><th>C2C Target</th><th>SC Target</th><th>Total Recharge</th><th>SSO Target</th><th>LSO Target</th><th>SC Achieved</th></tr></thead>
          <tbody>
            {visible.map((row) => {
              const index = rows.findIndex((item) => item.employeeId === row.employeeId);
              return <tr key={row.employeeId}>
                <td>{row.employeeCode ?? "-"}</td><td><strong>{row.name}</strong><div style={styles.small}>{row.rsoMsisdn}</div></td><td>{row.supervisor}</td><td style={{ textAlign: "right" }}>{row.retailerCount}</td>
                {numericFields.map((field) => <td key={field}><input type="number" min="0" step={["c2cTarget", "scTarget", "totalRechargeTarget", "scAchieved"].includes(field) ? "0.01" : "1"} value={row[field]} onChange={(event) => update(index, field, event.target.value)} style={styles.numberInput} /></td>)}
              </tr>;
            })}
            {!loading && !visible.length && <tr><td colSpan={11} style={{ textAlign: "center", padding: 24 }}>No employees found. Import Master Data first.</td></tr>}
          </tbody>
        </table>
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: { padding: 28, maxWidth: 1500, margin: "0 auto" },
  topbar: { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" },
  muted: { color: "#667085" }, small: { fontSize: 12, color: "#667085", marginTop: 3 },
  link: { color: "#175cd3", fontWeight: 700, textDecoration: "none" },
  panel: { background: "white", border: "1px solid #e4e7ec", borderRadius: 14, padding: 20 },
  controls: { display: "flex", gap: 14, alignItems: "end", flexWrap: "wrap" },
  label: { display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 700, minWidth: 180 },
  input: { border: "1px solid #d0d5dd", borderRadius: 8, padding: "10px 12px", font: "inherit", minWidth: 180 },
  numberInput: { width: 108, border: "1px solid #d0d5dd", borderRadius: 7, padding: "8px 9px", font: "inherit", textAlign: "right" },
  button: { border: 0, borderRadius: 8, padding: "11px 18px", background: "#175cd3", color: "white", fontWeight: 700, cursor: "pointer" },
  cards: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12, margin: "18px 0" },
  card: { background: "white", border: "1px solid #e4e7ec", borderRadius: 12, padding: 16 },
  table: { width: "100%", borderCollapse: "collapse", minWidth: 1280 },
};
