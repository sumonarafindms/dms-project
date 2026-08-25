-- Add explicit Manager -> Supervisor hierarchy mapping.
CREATE TABLE "ManagerSupervisor" (
    "id" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "supervisorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManagerSupervisor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ManagerSupervisor_supervisorId_key" ON "ManagerSupervisor"("supervisorId");
CREATE UNIQUE INDEX "ManagerSupervisor_managerId_supervisorId_key" ON "ManagerSupervisor"("managerId", "supervisorId");
CREATE INDEX "ManagerSupervisor_managerId_idx" ON "ManagerSupervisor"("managerId");

ALTER TABLE "ManagerSupervisor" ADD CONSTRAINT "ManagerSupervisor_managerId_fkey"
FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ManagerSupervisor" ADD CONSTRAINT "ManagerSupervisor_supervisorId_fkey"
FOREIGN KEY ("supervisorId") REFERENCES "Supervisor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
