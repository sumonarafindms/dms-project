-- Dynamic BP assignment: a retailer can be selected as BP for an RSO with effective-date history.
CREATE TABLE "BpAssignment" (
    "id" TEXT NOT NULL,
    "retailerId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "gaTarget" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BpAssignment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "User" ADD COLUMN "bpRetailerId" TEXT;

CREATE INDEX "BpAssignment_employeeId_active_idx" ON "BpAssignment"("employeeId", "active");
CREATE INDEX "BpAssignment_retailerId_active_idx" ON "BpAssignment"("retailerId", "active");
CREATE INDEX "BpAssignment_startDate_idx" ON "BpAssignment"("startDate");
CREATE UNIQUE INDEX "User_bpRetailerId_key" ON "User"("bpRetailerId");

ALTER TABLE "BpAssignment" ADD CONSTRAINT "BpAssignment_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "Retailer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BpAssignment" ADD CONSTRAINT "BpAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_bpRetailerId_fkey" FOREIGN KEY ("bpRetailerId") REFERENCES "Retailer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
