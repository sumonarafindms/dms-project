-- CreateEnum
CREATE TYPE "ImportType" AS ENUM ('GA', 'C2C', 'C2S', 'OB', 'EMPLOYEES', 'RETAILERS', 'TARGETS');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED');

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "employeeCode" TEXT,
    "name" TEXT NOT NULL,
    "supervisorName" TEXT,
    "bpName" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Retailer" (
    "id" TEXT NOT NULL,
    "retailerCode" TEXT NOT NULL,
    "retailerName" TEXT,
    "itopupNumber" TEXT,
    "employeeId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Retailer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyTarget" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "gaTarget" INTEGER NOT NULL DEFAULT 0,
    "c2cTarget" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "scTarget" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalRechargeTarget" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "ssoTarget" INTEGER NOT NULL DEFAULT 0,
    "lsoTarget" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualMetric" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "scAchieved" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "type" "ImportType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "businessDate" TIMESTAMP(3),
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "successRows" INTEGER NOT NULL DEFAULT 0,
    "failedRows" INTEGER NOT NULL DEFAULT 0,
    "hash" TEXT,
    "status" "ImportStatus" NOT NULL DEFAULT 'PROCESSING',

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportError" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportError_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GaRecord" (
    "id" TEXT NOT NULL,
    "retailerId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "gaCount" INTEGER NOT NULL DEFAULT 0,
    "ga150" INTEGER NOT NULL DEFAULT 0,
    "ga300" INTEGER NOT NULL DEFAULT 0,
    "batchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GaRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "C2cRecord" (
    "id" TEXT NOT NULL,
    "retailerId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "transactionCount" INTEGER NOT NULL DEFAULT 0,
    "amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "batchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "C2cRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "C2sRecord" (
    "id" TEXT NOT NULL,
    "retailerId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "transactionCount" INTEGER NOT NULL DEFAULT 0,
    "amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "enabled" BOOLEAN,
    "sellerStatus" TEXT,
    "batchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "C2sRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObRecord" (
    "id" TEXT NOT NULL,
    "retailerId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "transactionCount" INTEGER NOT NULL DEFAULT 0,
    "amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "batchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ObRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Employee_phoneNumber_key" ON "Employee"("phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_employeeCode_key" ON "Employee"("employeeCode");

-- CreateIndex
CREATE UNIQUE INDEX "Retailer_retailerCode_key" ON "Retailer"("retailerCode");

-- CreateIndex
CREATE INDEX "Retailer_employeeId_idx" ON "Retailer"("employeeId");

-- CreateIndex
CREATE INDEX "MonthlyTarget_month_idx" ON "MonthlyTarget"("month");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyTarget_employeeId_month_key" ON "MonthlyTarget"("employeeId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "ManualMetric_employeeId_month_key" ON "ManualMetric"("employeeId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "ImportBatch_hash_key" ON "ImportBatch"("hash");

-- CreateIndex
CREATE INDEX "GaRecord_date_idx" ON "GaRecord"("date");

-- CreateIndex
CREATE UNIQUE INDEX "GaRecord_retailerId_date_key" ON "GaRecord"("retailerId", "date");

-- CreateIndex
CREATE INDEX "C2cRecord_date_idx" ON "C2cRecord"("date");

-- CreateIndex
CREATE UNIQUE INDEX "C2cRecord_retailerId_date_key" ON "C2cRecord"("retailerId", "date");

-- CreateIndex
CREATE INDEX "C2sRecord_date_idx" ON "C2sRecord"("date");

-- CreateIndex
CREATE UNIQUE INDEX "C2sRecord_retailerId_date_key" ON "C2sRecord"("retailerId", "date");

-- CreateIndex
CREATE INDEX "ObRecord_date_idx" ON "ObRecord"("date");

-- CreateIndex
CREATE UNIQUE INDEX "ObRecord_retailerId_date_key" ON "ObRecord"("retailerId", "date");

-- AddForeignKey
ALTER TABLE "Retailer" ADD CONSTRAINT "Retailer_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyTarget" ADD CONSTRAINT "MonthlyTarget_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualMetric" ADD CONSTRAINT "ManualMetric_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportError" ADD CONSTRAINT "ImportError_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GaRecord" ADD CONSTRAINT "GaRecord_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "Retailer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GaRecord" ADD CONSTRAINT "GaRecord_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "C2cRecord" ADD CONSTRAINT "C2cRecord_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "Retailer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "C2cRecord" ADD CONSTRAINT "C2cRecord_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "C2sRecord" ADD CONSTRAINT "C2sRecord_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "Retailer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "C2sRecord" ADD CONSTRAINT "C2sRecord_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObRecord" ADD CONSTRAINT "ObRecord_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "Retailer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObRecord" ADD CONSTRAINT "ObRecord_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
