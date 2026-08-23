const kpis = [
  ["GA", "Company target", "Auto from Input GA"],
  ["C2C", "Company target", "Auto from Input C2C"],
  ["SC", "Company target", "Manual achievement entry"],
  ["Total Recharge", "Company target", "C2C + SC"],
  ["SSO", "Company target", "Retailers with monthly GA >= 2"],
  ["LSO", "Company target", "Retailers with C2S >= 500 and >= 7 transactions"],
];

export default function Dashboard() {
  return (
    <main style={{ padding: 32, maxWidth: 1200, margin: "0 auto" }}>
      <h1>Monthly Dashboard</h1>
      <p>First-pass KPI definition. Live values will come from PostgreSQL after import mapping is connected.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 16 }}>
        {kpis.map(([name, target, rule]) => (
          <section key={name} style={{ background: "white", borderRadius: 12, padding: 20, boxShadow: "0 1px 5px rgba(0,0,0,.08)" }}>
            <h2 style={{ marginTop: 0 }}>{name}</h2>
            <div>Target: {target}</div>
            <div style={{ marginTop: 8, color: "#555" }}>{rule}</div>
          </section>
        ))}
      </div>
    </main>
  );
}
