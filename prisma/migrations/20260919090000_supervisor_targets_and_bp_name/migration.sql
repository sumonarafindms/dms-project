-- v181. Two additions, both written by hand with IF NOT EXISTS so the file is
-- safe to re-apply, per the project's migration convention (see SECURITY.md).

-- 1. A supervisor's own monthly target.
--
-- Until now a supervisor held no target: every supervisor figure was the sum of
-- their RSOs' targets (plus their BPs' GA target on the dashboard path). The
-- owner's ruling is that the sum is too high to manage against, so a supervisor
-- now carries a target that is set directly on the Targets page and stands on
-- its own. The columns mirror "MonthlyTarget" exactly, so that every card which
-- shows a supervisor a GA, SSO, LSO, C2C, SC or Recharge target still finds one.
CREATE TABLE IF NOT EXISTS "SupervisorMonthlyTarget" (
    "id"                  TEXT NOT NULL,
    "supervisorId"        TEXT NOT NULL,
    "month"               TIMESTAMP(3) NOT NULL,
    "gaTarget"            INTEGER NOT NULL DEFAULT 0,
    "c2cTarget"           DECIMAL(18,2) NOT NULL DEFAULT 0,
    "scTarget"            DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalRechargeTarget" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "ssoTarget"           INTEGER NOT NULL DEFAULT 0,
    "lsoTarget"           INTEGER NOT NULL DEFAULT 0,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SupervisorMonthlyTarget_pkey" PRIMARY KEY ("id")
);

-- One row per supervisor per month: the Targets page upserts on this pair.
CREATE UNIQUE INDEX IF NOT EXISTS "SupervisorMonthlyTarget_supervisorId_month_key"
    ON "SupervisorMonthlyTarget" ("supervisorId", "month");

-- Reports read a whole month across every supervisor at once.
CREATE INDEX IF NOT EXISTS "SupervisorMonthlyTarget_month_idx"
    ON "SupervisorMonthlyTarget" ("month");

DO $$
BEGIN
    ALTER TABLE "SupervisorMonthlyTarget"
        ADD CONSTRAINT "SupervisorMonthlyTarget_supervisorId_fkey"
        FOREIGN KEY ("supervisorId") REFERENCES "Supervisor"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 2. The BP's own display name.
--
-- It cannot live in "retailerName": that column belongs to the master import
-- and is re-asserted from the vendor's file on every upload, so a name typed in
-- the admin screen would be overwritten by the next master file. Before this it
-- was written only to the BP login's "User"."displayName", so a BP with no
-- mobile number and PIN had nowhere to keep a name and the typed value was
-- dropped in silence. NULL means "no BP name given".
ALTER TABLE "Retailer" ADD COLUMN IF NOT EXISTS "bpName" TEXT;
