-- v198: a SIM product says which company activations it shows up as.
-- The UPDATEs are a one-time best guess from the product's own name, written
-- down so it can be read; every product can be changed on the Products page.

-- CreateEnum
CREATE TYPE "SimActivationType" AS ENUM ('GA_170', 'GA_300', 'SIM_SWAP');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "activationType" "SimActivationType";


-- Swap first: "Swap SIM 142" names a price too, and must not read as a 150/170 SIM.
UPDATE "Product" SET "activationType" = 'SIM_SWAP'
 WHERE "category" = 'SIM' AND "activationType" IS NULL AND "subType" ~* '(swap|\mev\M)';
UPDATE "Product" SET "activationType" = 'GA_300'
 WHERE "category" = 'SIM' AND "activationType" IS NULL AND "subType" ~ '(^|[^0-9])300([^0-9]|$)';
UPDATE "Product" SET "activationType" = 'GA_170'
 WHERE "category" = 'SIM' AND "activationType" IS NULL AND "subType" ~ '(^|[^0-9])(150|170)([^0-9]|$)';
