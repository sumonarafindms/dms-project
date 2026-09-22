-- Snapshot the unit price onto every movement, and move the price list out of
-- the product row into a dated history.
--
-- The order matters: unitPrice is backfilled FROM the price each movement was
-- recorded against, BEFORE that column is dropped. Every figure in the module
-- therefore reads exactly the same before and after this migration, which
-- .scratch/audit193.ts checks by comparing the totals it recorded first.

-- 1. The price history table.
CREATE TABLE "ProductPrice" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "price" DECIMAL(18,2) NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductPrice_pkey" PRIMARY KEY ("id")
);

-- 2. Snapshot: add the column, fill it from the product each movement points
--    at, and only then make it required.
ALTER TABLE "StockMovement" ADD COLUMN "unitPrice" DECIMAL(18,2);
UPDATE "StockMovement" m
   SET "unitPrice" = p."price"
  FROM "Product" p
 WHERE p."id" = m."productId";
ALTER TABLE "StockMovement" ALTER COLUMN "unitPrice" SET NOT NULL;

-- 3. Carry every existing price into the history, including the ones that only
--    existed as superseded version rows.
INSERT INTO "ProductPrice" ("id", "productId", "price", "effectiveFrom", "note", "createdById", "createdAt")
SELECT md5(random()::text || p."id")::text, p."id", p."price", p."effectiveDate",
       'Carried over from v192', p."createdById", NOW()
  FROM "Product" p;

-- 4. Collapse v192's version chains.
--
--    A row created by a price change (replacesId set) was a duplicate of the
--    product it replaced. Its price becomes a dated row on the ORIGINAL
--    product, its movements move to the original, and the duplicate goes. The
--    movements keep the unitPrice filled in step 2, so not one figure moves.
UPDATE "ProductPrice" pp
   SET "productId" = c."replacesId"
  FROM "Product" c
 WHERE c."id" = pp."productId" AND c."replacesId" IS NOT NULL;

UPDATE "StockMovement" m
   SET "productId" = c."replacesId"
  FROM "Product" c
 WHERE c."id" = m."productId" AND c."replacesId" IS NOT NULL;

-- A collapsed product may now hold two prices starting the same day; keep the
-- later-created one, which is the one that was in force.
DELETE FROM "ProductPrice" a
 USING "ProductPrice" b
 WHERE a."productId" = b."productId"
   AND a."effectiveFrom" = b."effectiveFrom"
   AND a."createdAt" < b."createdAt";

DELETE FROM "Product" WHERE "replacesId" IS NOT NULL;

-- A product that was retired only because a newer version replaced it is back
-- in use: the newer version is now one of its prices, not a separate thing.
UPDATE "Product" SET "status" = 'ACTIVE'
 WHERE "status" = 'INACTIVE'
   AND "id" IN (SELECT "productId" FROM "ProductPrice" GROUP BY "productId" HAVING COUNT(*) > 1);

-- 5. The product row is identity only from here on.
DROP INDEX IF EXISTS "Product_replacesId_key";
DROP INDEX IF EXISTS "Product_effectiveDate_idx";
ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS "Product_replacesId_fkey";
ALTER TABLE "Product" DROP COLUMN "replacesId";
ALTER TABLE "Product" DROP COLUMN "price";
ALTER TABLE "Product" DROP COLUMN "effectiveDate";

-- 6. Indexes and keys.
CREATE UNIQUE INDEX "ProductPrice_productId_effectiveFrom_key" ON "ProductPrice"("productId", "effectiveFrom");
CREATE INDEX "ProductPrice_productId_effectiveFrom_idx" ON "ProductPrice"("productId", "effectiveFrom");
ALTER TABLE "ProductPrice" ADD CONSTRAINT "ProductPrice_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
