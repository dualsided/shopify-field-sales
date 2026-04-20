-- Add app_api_key column to shops table for multi-deployment identification
ALTER TABLE "shops" ADD COLUMN "app_api_key" TEXT;

-- Create index for faster filtering by app instance
CREATE INDEX "shops_app_api_key_idx" ON "shops"("app_api_key");
