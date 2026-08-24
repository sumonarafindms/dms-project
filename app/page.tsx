export default function Home() {
  return (
    <main style={{ padding: 32, maxWidth: 1000, margin: "0 auto" }}>
      <h1>DMS Sales Reporting</h1>
      <p style={{ color: "#667085" }}>Database-driven replacement for the Excel reporting workflow.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 16, marginTop: 24 }}>
        <a href="/master-data" style={card}>Master Data<br/><span style={small}>Supervisor → Employee → Retailer</span></a>
        <a href="/targets" style={card}>Monthly Targets<br/><span style={small}>Targets + manual SC achievement</span></a>
        <a href="/ga" style={card}>GA & SSO<br/><span style={small}>Daily activation upload + GA/SSO</span></a>
        <a href="/c2c" style={card}>C2C Recharge<br/><span style={small}>MTD upload + date-wise balance</span></a>
        <a href="/c2s" style={card}>C2S & LSO<br/><span style={small}>MTD retailer sales + LSO achievement</span></a>
        <a href="/ob" style={card}>Opening Balance<br/><span style={small}>Latest retailer balance snapshot only</span></a>
        <a href="/dashboard" style={card}>Dashboard<br/><span style={small}>Target vs achievement KPIs</span></a>
      </div>
    </main>
  );
}
const card: React.CSSProperties = { background: "white", border: "1px solid #e4e7ec", borderRadius: 14, padding: 20, color: "#101828", textDecoration: "none", fontWeight: 700, fontSize: 20 };
const small: React.CSSProperties = { color: "#667085", fontSize: 14, fontWeight: 400, lineHeight: 2 };
