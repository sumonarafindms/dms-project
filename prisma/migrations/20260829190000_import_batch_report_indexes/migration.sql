-- Reporting Centre "Data Readiness" filters ImportBatch by type + businessDate
-- + status on every page load; the Upload Center lists one type newest-first.
-- Both were sequential scans over the whole batch table.
CREATE INDEX IF NOT EXISTS "ImportBatch_type_businessDate_status_idx"
  ON "ImportBatch" ("type", "businessDate", "status");

CREATE INDEX IF NOT EXISTS "ImportBatch_type_uploadedAt_idx"
  ON "ImportBatch" ("type", "uploadedAt");
