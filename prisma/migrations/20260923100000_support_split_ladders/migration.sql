-- v198: Sim Support runs two SIM ladders (170 and 300). Existing slabs become tier ALL,
-- so every offer saved before this keeps paying exactly what it paid.

-- CreateEnum
CREATE TYPE "SupportTier" AS ENUM ('ALL', 'GA_170', 'GA_300');

-- CreateEnum
CREATE TYPE "SupportSlabBasis" AS ENUM ('TOTAL', 'OWN');

-- DropIndex
DROP INDEX "SupportSlab_schemeId_minSims_key";

-- AlterTable
ALTER TABLE "SupportScheme" ADD COLUMN     "dailyTarget" INTEGER,
ADD COLUMN     "slabBasis" "SupportSlabBasis" NOT NULL DEFAULT 'TOTAL';

-- AlterTable
ALTER TABLE "SupportSlab" ADD COLUMN     "tier" "SupportTier" NOT NULL DEFAULT 'ALL';

-- CreateIndex
CREATE UNIQUE INDEX "SupportSlab_schemeId_tier_minSims_key" ON "SupportSlab"("schemeId", "tier", "minSims");

