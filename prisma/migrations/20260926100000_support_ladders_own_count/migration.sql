-- v203: a split Sim Support offer is always read ladder by ladder — each SIM type
-- on its own count (the owner: "aita alada hobe"). New offers default to OWN, and
-- every saved offer is moved to OWN so past days read the same way.

-- AlterTable
ALTER TABLE "SupportScheme" ALTER COLUMN "slabBasis" SET DEFAULT 'OWN';


-- Data
UPDATE "SupportScheme" SET "slabBasis" = 'OWN' WHERE "slabBasis" <> 'OWN';
