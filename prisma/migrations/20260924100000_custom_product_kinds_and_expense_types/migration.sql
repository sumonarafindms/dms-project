-- v201: the owner can name his own product kinds ("Smart watch") and expense types.
-- Both are additive: a new enum value and two nullable columns.

-- AlterEnum
ALTER TYPE "ProductCategory" ADD VALUE 'OTHER';

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "label" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "kindName" TEXT;

