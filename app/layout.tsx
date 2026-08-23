export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "Arial, sans-serif", margin: 0, background: "#f5f7fb", color: "#101828" }}>
        <style>{`th,td{padding:11px 12px;border-bottom:1px solid #eaecf0;text-align:left}th{font-size:13px;color:#475467;background:#f9fafb}`}</style>
        {children}
      </body>
    </html>
  );
}
