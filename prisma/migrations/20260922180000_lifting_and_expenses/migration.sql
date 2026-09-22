-- CreateEnum
CREATE TYPE "LiftingKind" AS ENUM ('PURCHASE', 'OPENING');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('TRANSPORT', 'FOOD', 'OFFICE', 'UTILITY', 'SALARY', 'REPAIR', 'MARKETING', 'OTHER');

-- CreateEnum
CREATE TYPE "PaidFrom" AS ENUM ('CASH', 'BANK');

-- CreateTable
CREATE TABLE "Lifting" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "kind" "LiftingKind" NOT NULL DEFAULT 'PURCHASE',
    "productId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unitCost" DECIMAL(18,2) NOT NULL,
    "invoiceRef" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lifting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "paidFrom" "PaidFrom" NOT NULL DEFAULT 'CASH',
    "payee" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lifting_date_idx" ON "Lifting"("date");

-- CreateIndex
CREATE INDEX "Lifting_productId_date_idx" ON "Lifting"("productId", "date");

-- CreateIndex
CREATE INDEX "Expense_date_idx" ON "Expense"("date");

-- CreateIndex
CREATE INDEX "Expense_category_date_idx" ON "Expense"("category", "date");

-- AddForeignKey
ALTER TABLE "Lifting" ADD CONSTRAINT "Lifting_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

