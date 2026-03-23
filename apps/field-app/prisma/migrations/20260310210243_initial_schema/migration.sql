-- CreateEnum
CREATE TYPE "PaymentStrategy" AS ENUM ('shopify_terms', 'stripe_vault', 'shopify_vault');

-- CreateEnum
CREATE TYPE "RepRole" AS ENUM ('rep', 'manager', 'admin');

-- CreateEnum
CREATE TYPE "PaymentTerms" AS ENUM ('due_on_order', 'net_15', 'net_30', 'net_45', 'net_60');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('synced', 'pending', 'error');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('stripe', 'shopify_terms', 'shopify_vault');

-- CreateEnum
CREATE TYPE "CartStatus" AS ENUM ('active', 'submitted', 'abandoned');

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "is_online" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "access_token" TEXT NOT NULL,
    "user_id" BIGINT,
    "first_name" TEXT,
    "last_name" TEXT,
    "email" TEXT,
    "account_owner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "email_verified" BOOLEAN DEFAULT false,
    "refresh_token" TEXT,
    "refresh_token_expires" TIMESTAMP(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shops" (
    "id" TEXT NOT NULL,
    "shopify_domain" TEXT NOT NULL,
    "shop_name" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,
    "payment_strategy" "PaymentStrategy" NOT NULL DEFAULT 'shopify_terms',
    "stripe_account_id" TEXT,
    "config" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "shopify_plan" TEXT,
    "has_managed_companies" BOOLEAN NOT NULL DEFAULT false,
    "plan_detected_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_reps" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "phone" TEXT,
    "role" "RepRole" NOT NULL DEFAULT 'rep',
    "password_hash" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_reps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "territories" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "territories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "territory_zipcodes" (
    "id" TEXT NOT NULL,
    "territory_id" TEXT NOT NULL,
    "zipcode" TEXT NOT NULL,

    CONSTRAINT "territory_zipcodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rep_territories" (
    "id" TEXT NOT NULL,
    "rep_id" TEXT NOT NULL,
    "territory_id" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rep_territories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "shopify_company_id" TEXT,
    "name" TEXT NOT NULL,
    "account_number" TEXT,
    "payment_terms" "PaymentTerms" NOT NULL DEFAULT 'due_on_order',
    "territory_id" TEXT,
    "assigned_rep_id" TEXT,
    "sync_status" "SyncStatus" NOT NULL DEFAULT 'synced',
    "last_synced_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_locations" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "shopify_location_id" TEXT,
    "name" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "address1" TEXT,
    "address2" TEXT,
    "city" TEXT,
    "province" TEXT,
    "province_code" TEXT,
    "zipcode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'US',
    "country_code" TEXT NOT NULL DEFAULT 'US',
    "phone" TEXT,
    "is_shipping_address" BOOLEAN NOT NULL DEFAULT true,
    "is_billing_address" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_contacts" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "shopify_contact_id" TEXT,
    "shopify_customer_id" TEXT,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "title" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "can_place_orders" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_methods" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "provider" "PaymentProvider" NOT NULL,
    "external_customer_id" TEXT,
    "external_method_id" TEXT NOT NULL,
    "last4" TEXT,
    "brand" TEXT,
    "expiry_month" INTEGER,
    "expiry_year" INTEGER,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_sessions" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "rep_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "line_items" JSONB NOT NULL,
    "notes" TEXT,
    "status" "CartStatus" NOT NULL DEFAULT 'active',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cart_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "rep_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "shopify_order_id" TEXT NOT NULL,
    "shopify_order_number" TEXT NOT NULL,
    "territory_id" TEXT,
    "payment_provider" "PaymentProvider",
    "payment_transaction_id" TEXT,
    "order_total" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL,
    "placed_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shops_shopify_domain_key" ON "shops"("shopify_domain");

-- CreateIndex
CREATE INDEX "sales_reps_shop_id_idx" ON "sales_reps"("shop_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_reps_shop_id_email_key" ON "sales_reps"("shop_id", "email");

-- CreateIndex
CREATE INDEX "territories_shop_id_idx" ON "territories"("shop_id");

-- CreateIndex
CREATE INDEX "territory_zipcodes_zipcode_idx" ON "territory_zipcodes"("zipcode");

-- CreateIndex
CREATE UNIQUE INDEX "territory_zipcodes_territory_id_zipcode_key" ON "territory_zipcodes"("territory_id", "zipcode");

-- CreateIndex
CREATE UNIQUE INDEX "rep_territories_rep_id_territory_id_key" ON "rep_territories"("rep_id", "territory_id");

-- CreateIndex
CREATE INDEX "companies_territory_id_idx" ON "companies"("territory_id");

-- CreateIndex
CREATE INDEX "companies_assigned_rep_id_idx" ON "companies"("assigned_rep_id");

-- CreateIndex
CREATE INDEX "companies_shop_id_is_active_idx" ON "companies"("shop_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "companies_shop_id_shopify_company_id_key" ON "companies"("shop_id", "shopify_company_id");

-- CreateIndex
CREATE UNIQUE INDEX "companies_shop_id_account_number_key" ON "companies"("shop_id", "account_number");

-- CreateIndex
CREATE INDEX "company_locations_zipcode_idx" ON "company_locations"("zipcode");

-- CreateIndex
CREATE UNIQUE INDEX "company_locations_company_id_shopify_location_id_key" ON "company_locations"("company_id", "shopify_location_id");

-- CreateIndex
CREATE UNIQUE INDEX "company_contacts_company_id_email_key" ON "company_contacts"("company_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "company_contacts_company_id_shopify_contact_id_key" ON "company_contacts"("company_id", "shopify_contact_id");

-- CreateIndex
CREATE INDEX "payment_methods_company_id_is_default_idx" ON "payment_methods"("company_id", "is_default");

-- CreateIndex
CREATE INDEX "payment_methods_contact_id_idx" ON "payment_methods"("contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_methods_shop_id_company_id_external_method_id_key" ON "payment_methods"("shop_id", "company_id", "external_method_id");

-- CreateIndex
CREATE INDEX "cart_sessions_shop_id_rep_id_idx" ON "cart_sessions"("shop_id", "rep_id");

-- CreateIndex
CREATE INDEX "cart_sessions_company_id_idx" ON "cart_sessions"("company_id");

-- CreateIndex
CREATE INDEX "orders_rep_id_placed_at_idx" ON "orders"("rep_id", "placed_at" DESC);

-- CreateIndex
CREATE INDEX "orders_company_id_placed_at_idx" ON "orders"("company_id", "placed_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "orders_shop_id_shopify_order_id_key" ON "orders"("shop_id", "shopify_order_id");

-- AddForeignKey
ALTER TABLE "sales_reps" ADD CONSTRAINT "sales_reps_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "territories" ADD CONSTRAINT "territories_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "territory_zipcodes" ADD CONSTRAINT "territory_zipcodes_territory_id_fkey" FOREIGN KEY ("territory_id") REFERENCES "territories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rep_territories" ADD CONSTRAINT "rep_territories_rep_id_fkey" FOREIGN KEY ("rep_id") REFERENCES "sales_reps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rep_territories" ADD CONSTRAINT "rep_territories_territory_id_fkey" FOREIGN KEY ("territory_id") REFERENCES "territories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_territory_id_fkey" FOREIGN KEY ("territory_id") REFERENCES "territories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_assigned_rep_id_fkey" FOREIGN KEY ("assigned_rep_id") REFERENCES "sales_reps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_locations" ADD CONSTRAINT "company_locations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_contacts" ADD CONSTRAINT "company_contacts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "company_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_sessions" ADD CONSTRAINT "cart_sessions_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_sessions" ADD CONSTRAINT "cart_sessions_rep_id_fkey" FOREIGN KEY ("rep_id") REFERENCES "sales_reps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_sessions" ADD CONSTRAINT "cart_sessions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_rep_id_fkey" FOREIGN KEY ("rep_id") REFERENCES "sales_reps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_territory_id_fkey" FOREIGN KEY ("territory_id") REFERENCES "territories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
