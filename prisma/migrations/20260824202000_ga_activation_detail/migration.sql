-- Store only the minimum activation-level GA data needed for history, deduplication and calculations.
ALTER TABLE "ImportBatch" ADD COLUMN "duplicateRows" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "GaActivation" (
    "id" TEXT NOT NULL,
    "simNo" TEXT NOT NULL,
    "retailerId" TEXT NOT NULL,
    "activationDate" TIMESTAMP(3) NOT NULL,
    "activationTime" TEXT,
    "sellingPrice" DECIMAL(10,2) NOT NULL,
    "batchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GaActivation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GaActivation_simNo_key" ON "GaActivation"("simNo");
CREATE INDEX "GaActivation_activationDate_idx" ON "GaActivation"("activationDate");
CREATE INDEX "GaActivation_retailerId_activationDate_idx" ON "GaActivation"("retailerId", "activationDate");
CREATE INDEX "GaActivation_batchId_idx" ON "GaActivation"("batchId");

ALTER TABLE "GaActivation" ADD CONSTRAINT "GaActivation_retailerId_fkey"
FOREIGN KEY ("retailerId") REFERENCES "Retailer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GaActivation" ADD CONSTRAINT "GaActivation_batchId_fkey"
FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
