ALTER TABLE "GaActivation" ADD COLUMN "productCode" TEXT;
CREATE INDEX "GaActivation_productCode_idx" ON "GaActivation"("productCode");
