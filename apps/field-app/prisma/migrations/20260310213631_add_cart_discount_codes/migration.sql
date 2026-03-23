-- AlterTable
ALTER TABLE "cart_sessions" ADD COLUMN     "discount_codes" TEXT[] DEFAULT ARRAY[]::TEXT[];
