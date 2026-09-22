-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('SIM', 'CARD', 'ROUTER', 'HANDSET', 'ITOPUP');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "StockHolderType" AS ENUM ('RSO', 'SUPERVISOR', 'BP');

-- CreateEnum
CREATE TYPE "StockMoveKind" AS ENUM ('GIVEN', 'SOLD', 'RETURNED', 'OPENING');

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "category" "ProductCategory" NOT NULL,
    "subType" TEXT NOT NULL,
    "unitLabel" TEXT,
    "price" DECIMAL(18,2) NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "replacesId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "kind" "StockMoveKind" NOT NULL,
    "holderType" "StockHolderType" NOT NULL,
    "holderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashDeposit" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "holderType" "StockHolderType" NOT NULL,
    "holderId" TEXT NOT NULL,
    "cash" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "bank" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "bankRef" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashDeposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockOpening" (
    "id" TEXT NOT NULL,
    "holderType" "StockHolderType" NOT NULL,
    "holderId" TEXT NOT NULL,
    "asOfDate" DATE NOT NULL,
    "openingDue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockOpening_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_replacesId_key" ON "Product"("replacesId");

-- CreateIndex
CREATE INDEX "Product_status_category_idx" ON "Product"("status", "category");

-- CreateIndex
CREATE INDEX "Product_effectiveDate_idx" ON "Product"("effectiveDate");

-- CreateIndex
CREATE INDEX "StockMovement_holderType_holderId_date_idx" ON "StockMovement"("holderType", "holderId", "date");

-- CreateIndex
CREATE INDEX "StockMovement_date_idx" ON "StockMovement"("date");

-- CreateIndex
CREATE INDEX "StockMovement_productId_idx" ON "StockMovement"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_holderType_holderId_date_productId_kind_key" ON "StockMovement"("holderType", "holderId", "date", "productId", "kind");

-- CreateIndex
CREATE INDEX "CashDeposit_date_idx" ON "CashDeposit"("date");

-- CreateIndex
CREATE UNIQUE INDEX "CashDeposit_holderType_holderId_date_key" ON "CashDeposit"("holderType", "holderId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "StockOpening_holderType_holderId_key" ON "StockOpening"("holderType", "holderId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_replacesId_fkey" FOREIGN KEY ("replacesId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

