CREATE TABLE "C2cMonthlySummary" (
  "id" TEXT NOT NULL,
  "retailerId" TEXT NOT NULL,
  "month" TIMESTAMP(3) NOT NULL,
  "transactionCount" INTEGER NOT NULL DEFAULT 0,
  "totalAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "reportEndDate" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "C2cMonthlySummary_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "C2cMonthlySummary_retailerId_month_key" ON "C2cMonthlySummary"("retailerId","month");
CREATE INDEX "C2cMonthlySummary_month_idx" ON "C2cMonthlySummary"("month");
ALTER TABLE "C2cMonthlySummary" ADD CONSTRAINT "C2cMonthlySummary_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "Retailer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "C2sMonthlySummary" (
  "id" TEXT NOT NULL,
  "retailerId" TEXT NOT NULL,
  "month" TIMESTAMP(3) NOT NULL,
  "transactionCount" INTEGER NOT NULL DEFAULT 0,
  "totalAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "reportEndDate" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "C2sMonthlySummary_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "C2sMonthlySummary_retailerId_month_key" ON "C2sMonthlySummary"("retailerId","month");
CREATE INDEX "C2sMonthlySummary_month_idx" ON "C2sMonthlySummary"("month");
ALTER TABLE "C2sMonthlySummary" ADD CONSTRAINT "C2sMonthlySummary_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "Retailer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
