CREATE TABLE "BpMonthlyTarget" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "gaTarget" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BpMonthlyTarget_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BpMonthlyTarget_assignmentId_month_key" ON "BpMonthlyTarget"("assignmentId","month");
CREATE INDEX "BpMonthlyTarget_month_idx" ON "BpMonthlyTarget"("month");
ALTER TABLE "BpMonthlyTarget" ADD CONSTRAINT "BpMonthlyTarget_assignmentId_fkey"
FOREIGN KEY ("assignmentId") REFERENCES "BpAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
