export default function Home() {
  return (
    <main style={{ padding: 40, maxWidth: 1000, margin: "0 auto" }}>
      <h1>DMS Sales Reporting System</h1>
      <p>Master data, monthly targets, daily imports and KPI reporting.</p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <a href="/master-data">Master Data</a>
        <a href="/dashboard">Dashboard</a>
      </div>
    </main>
  );
}
