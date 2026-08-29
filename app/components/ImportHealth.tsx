/**
 * Feed freshness cards — migrated to the role-UI kit.
 *
 * One card per operational import. The question this answers is "did the
 * newest source file actually reach DMS", so the status word and the report
 * end date lead; row counts are the supporting detail underneath.
 */

import { Icon } from "./icons";
import { Badge, Card } from "./Kit";
import type { BadgeTone } from "./Kit";

type HealthItem = {
  type: string;
  label: string;
  fileName?: string | null;
  uploadedAt?: Date | null;
  businessDate?: Date | null;
  successRows?: number;
  failedRows?: number;
  duplicateRows?: number;
  status?: string | null;
};

function day(value?: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "—";
}
function stamp(value?: Date | null) {
  return value
    ? value.toLocaleString("en-GB", {
        timeZone: "Asia/Dhaka",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "No import yet";
}
/** Import status words mapped onto the kit's badge tones. */
function tone(status?: string | null): BadgeTone {
  const s = (status || "").toUpperCase();
  if (s === "SUCCESS" || s === "COMPLETE" || s === "COMPLETED") return "success";
  if (s === "FAILED" || s === "ERROR") return "failed";
  if (s === "PROCESSING" || s === "RUNNING") return "processing";
  if (s === "PENDING") return "pending";
  return "neutral";
}

const ICON: Record<string, string> = { GA: "sim", C2C: "wallet", C2S: "chart", OB: "balance" };

export function ImportHealthGrid({ items }: { items: HealthItem[] }) {
  return (
    <div className="kit-card-grid is-quad">
      {items.map((item) => (
        <Card padded key={item.type}>
          <div className="kit-feed-head">
            <div className="kit-module-top">
              <span className="kit-module-icon" aria-hidden="true">
                <Icon name={ICON[item.type] || "chart"} />
              </span>
              <div className="kit-module-main">
                <p className="kit-eyebrow">{item.type}</p>
                <strong>{item.label}</strong>
              </div>
            </div>
            <Badge tone={tone(item.status)}>{item.status || "No data"}</Badge>
          </div>

          <p className="kit-feed-file" title={item.fileName || ""}>
            {item.fileName || "No import yet"}
          </p>

          <div className="kit-feed-meta">
            <div>
              <span>Report end</span>
              <b>{day(item.businessDate)}</b>
            </div>
            <div>
              <span>Uploaded</span>
              <b>{stamp(item.uploadedAt)}</b>
            </div>
          </div>

          <div className="kit-feed-counts">
            <span>
              <b>{item.successRows || 0}</b> saved
            </span>
            <span>
              <b>{item.duplicateRows || 0}</b> duplicate
            </span>
            <span className={(item.failedRows || 0) > 0 ? "is-warn" : undefined}>
              <b>{item.failedRows || 0}</b> failed
            </span>
          </div>
        </Card>
      ))}
    </div>
  );
}
