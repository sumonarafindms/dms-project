-- v206: the cash box (CashMove, DayClose) and closed months (MonthClose). Additive only.
-- CreateEnum
CREATE TYPE "CashMoveKind" AS ENUM ('BANK_DEPOSIT', 'COMPANY_PAYMENT', 'OWNER_TAKEN', 'OTHER_OUT', 'OWNER_ADDED', 'OTHER_IN');

-- CreateTable
CREATE TABLE "CashMove" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "kind" "CashMoveKind" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashMove_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DayClose" (
    "date" DATE NOT NULL,
    "openingCash" DECIMAL(18,2) NOT NULL,
    "openingTyped" BOOLEAN NOT NULL DEFAULT false,
    "cashIn" DECIMAL(18,2) NOT NULL,
    "cashOut" DECIMAL(18,2) NOT NULL,
    "expected" DECIMAL(18,2) NOT NULL,
    "counted" DECIMAL(18,2) NOT NULL,
    "denominations" JSONB NOT NULL,
    "note" TEXT,
    "closedById" TEXT NOT NULL,
    "closedByName" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DayClose_pkey" PRIMARY KEY ("date")
);

-- CreateTable
CREATE TABLE "MonthClose" (
    "month" TEXT NOT NULL,
    "closedById" TEXT NOT NULL,
    "closedByName" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "MonthClose_pkey" PRIMARY KEY ("month")
);

-- CreateIndex
CREATE INDEX "CashMove_date_idx" ON "CashMove"("date");

