-- Campaigns and Sim Support (v189)
--
-- Additive only: two new feature areas plus one flag on Retailer. Nothing
-- existing is altered or dropped, so this migration is safe to run against a
-- database that is already serving.

-- CreateEnum
CREATE TYPE "CampaignScope" AS ENUM ('DISTRIBUTION', 'PER_EMPLOYEE');

-- AlterTable: which outlets earn Sim Support. Two per RSO, chosen by hand.
ALTER TABLE "Retailer" ADD COLUMN "supportEligible" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "Retailer_employeeId_supportEligible_idx" ON "Retailer"("employeeId", "supportEligible");

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "scope" "CampaignScope" NOT NULL,
    "totalTarget" INTEGER,
    "perEmployeeTarget" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Campaign_startDate_endDate_idx" ON "Campaign"("startDate", "endDate");
CREATE INDEX "Campaign_active_idx" ON "Campaign"("active");
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "CampaignTarget" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "target" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignTarget_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CampaignTarget_campaignId_employeeId_key" ON "CampaignTarget"("campaignId", "employeeId");
CREATE INDEX "CampaignTarget_employeeId_idx" ON "CampaignTarget"("employeeId");
ALTER TABLE "CampaignTarget" ADD CONSTRAINT "CampaignTarget_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignTarget" ADD CONSTRAINT "CampaignTarget_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "SupportScheme" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT,
    "note" TEXT,
    "ssoRatePerSim" DECIMAL(10,2),
    "ssoMinSimsSameDay" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportScheme_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SupportScheme_date_key" ON "SupportScheme"("date");
CREATE INDEX "SupportScheme_active_idx" ON "SupportScheme"("active");
ALTER TABLE "SupportScheme" ADD CONSTRAINT "SupportScheme_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "SupportSlab" (
    "id" TEXT NOT NULL,
    "schemeId" TEXT NOT NULL,
    "minSims" INTEGER NOT NULL,
    "ratePerSim" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportSlab_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SupportSlab_schemeId_minSims_key" ON "SupportSlab"("schemeId", "minSims");
CREATE INDEX "SupportSlab_schemeId_idx" ON "SupportSlab"("schemeId");
ALTER TABLE "SupportSlab" ADD CONSTRAINT "SupportSlab_schemeId_fkey" FOREIGN KEY ("schemeId") REFERENCES "SupportScheme"("id") ON DELETE CASCADE ON UPDATE CASCADE;
