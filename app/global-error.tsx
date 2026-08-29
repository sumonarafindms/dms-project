"use client";

/**
 * The last-resort error page: it renders when the ROOT layout itself failed,
 * so it supplies its own <html> and <body> and cannot assume any stylesheet
 * was ever linked. That is why every style here is inline and every colour is
 * a literal rather than a token — this is the one file in the project where
 * converting to classes would make it worse, and the CSP allows style
 * attributes partly on its account. Do not "tidy" these into kit.css.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html>
      <body>
        <main
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            padding: 24,
            fontFamily: "Arial,sans-serif",
            background: "#f8fafc",
          }}
        >
          <div
            style={{
              maxWidth: 520,
              padding: 28,
              borderRadius: 20,
              background: "#fff",
              border: "1px solid #e2e8f0",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 800, color: "#7c3aed" }}>DMS SYSTEM ERROR</div>
            <h1 style={{ fontSize: 28, margin: "8px 0" }}>The application could not start.</h1>
            <p style={{ color: "#64748b", lineHeight: 1.6 }}>
              Please retry. If the problem continues, check the deployment and database connection.
            </p>
            <button
              onClick={reset}
              style={{
                minHeight: 42,
                padding: "0 18px",
                border: 0,
                borderRadius: 10,
                background: "#4f46e5",
                color: "#fff",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Retry application
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
