-- Master data hierarchy migration
-- Preserves the initial database while normalizing Supervisor -> Employee -> Retailer.

CREATE TABLE "Supervisor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Supervisor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Supervisor_name_key" ON "Supervisor"("name");

INSERT INTO "Supervisor" ("id", "name", "active", "createdAt", "updatedAt")
SELECT 'sup_' || md5(trim("supervisorName")), trim("supervisorName"), true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Employee"
WHERE "supervisorName" IS NOT NULL AND trim("supervisorName") <> ''
GROUP BY trim("supervisorName");

ALTER TABLE "Employee" RENAME COLUMN "phoneNumber" TO "rsoMsisdn";
ALTER INDEX "Employee_phoneNumber_key" RENAME TO "Employee_rsoMsisdn_key";
ALTER TABLE "Employee" ADD COLUMN "supervisorId" TEXT;

UPDATE "Employee" e
SET "supervisorId" = s."id"
FROM "Supervisor" s
WHERE e."supervisorName" IS NOT NULL AND trim(e."supervisorName") = s."name";

ALTER TABLE "Employee" DROP COLUMN "supervisorName";
ALTER TABLE "Employee" DROP COLUMN "bpName";
CREATE INDEX "Employee_supervisorId_idx" ON "Employee"("supervisorId");
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_supervisorId_fkey"
FOREIGN KEY ("supervisorId") REFERENCES "Supervisor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Retailer" RENAME COLUMN "itopupNumber" TO "iTopUpNumber";
ALTER TABLE "Retailer" ADD COLUMN "simSeller" TEXT;
ALTER TABLE "Retailer" ADD COLUMN "iTopUpSeller" TEXT;
ALTER TABLE "Retailer" ADD COLUMN "tranMobileNo" TEXT;
ALTER TABLE "Retailer" ADD COLUMN "iTopUpSrNumber" TEXT;
ALTER TABLE "Retailer" ADD COLUMN "category" TEXT;
ALTER TABLE "Retailer" ADD COLUMN "rsoCode" TEXT;
ALTER TABLE "Retailer" ADD COLUMN "route" TEXT;

UPDATE "Retailer" r
SET "iTopUpSrNumber" = e."rsoMsisdn"
FROM "Employee" e
WHERE r."employeeId" = e."id";

ALTER TABLE "Retailer" ALTER COLUMN "employeeId" DROP NOT NULL;
CREATE INDEX "Retailer_iTopUpSrNumber_idx" ON "Retailer"("iTopUpSrNumber");
