-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PaymentStrategy" AS ENUM ('shopify_terms', 'shopify_vault');

-- CreateEnum
CREATE TYPE "BillingPlan" AS ENUM ('basic', 'grow', 'pro', 'plus');

-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('inactive', 'trial', 'active', 'past_due', 'cancelled');

-- CreateEnum
CREATE TYPE "RepRole" AS ENUM ('rep', 'manager', 'admin');

-- CreateEnum
CREATE TYPE "PaymentTerms" AS ENUM ('due_on_order', 'due_on_receipt', 'due_on_fulfillment', 'net_15', 'net_30', 'net_45', 'net_60');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('synced', 'pending', 'syncing', 'error', 'not_synced');

-- CreateEnum
CREATE TYPE "CatalogStatus" AS ENUM ('active', 'draft', 'archived');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('shopify_terms', 'shopify_vault');

-- CreateEnum
CREATE TYPE "CartStatus" AS ENUM ('active', 'submitted', 'abandoned');

-- CreateEnum
CREATE TYPE "AuthorType" AS ENUM ('sales_rep', 'admin', 'system');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('draft', 'awaiting_review', 'pending', 'paid', 'cancelled', 'refunded');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('active', 'archived', 'draft');

-- CreateEnum
CREATE TYPE "PromotionType" AS ENUM ('percentage', 'fixed_amount', 'buy_x_get_y', 'spend_get_free');

-- CreateEnum
CREATE TYPE "PromotionScope" AS ENUM ('line_item', 'order_total', 'shipping');

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
    "logo_url" TEXT,
    "accent_color" TEXT,
    "payment_strategy" "PaymentStrategy" NOT NULL DEFAULT 'shopify_terms',
    "config" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "shopify_plan" TEXT,
    "has_managed_companies" BOOLEAN NOT NULL DEFAULT false,
    "plan_detected_at" TIMESTAMP(3),
    "product_inclusion_tag" TEXT,
    "order_prefix" TEXT NOT NULL DEFAULT 'FS',
    "order_number_start" INTEGER NOT NULL DEFAULT 1,
    "billing_plan" "BillingPlan",
    "billing_status" "BillingStatus" NOT NULL DEFAULT 'inactive',
    "shopify_subscription_id" TEXT,
    "usage_line_item_id" TEXT,
    "subscription_status" TEXT,
    "current_period_start" TIMESTAMP(3),
    "current_period_end" TIMESTAMP(3),
    "trial_ends_at" TIMESTAMP(3),
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
    "password_hash" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "approval_threshold_cents" INTEGER,
    "activated_at" TIMESTAMP(3),
    "deactivated_at" TIMESTAMP(3),
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
CREATE TABLE "territory_states" (
    "id" TEXT NOT NULL,
    "territory_id" TEXT NOT NULL,
    "state_code" TEXT NOT NULL,
    "state_name" TEXT NOT NULL,

    CONSTRAINT "territory_states_pkey" PRIMARY KEY ("id")
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
    "territory_id" TEXT,
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
    "payment_terms_type" TEXT,
    "payment_terms_days" INTEGER,
    "checkout_to_draft" BOOLEAN NOT NULL DEFAULT false,
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
CREATE TABLE "catalogs" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "shopify_catalog_id" TEXT NOT NULL,
    "shopify_price_list_id" TEXT,
    "title" TEXT NOT NULL,
    "status" "CatalogStatus" NOT NULL DEFAULT 'active',
    "currency_code" TEXT NOT NULL DEFAULT 'USD',
    "synced_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_location_catalogs" (
    "company_location_id" TEXT NOT NULL,
    "catalog_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_location_catalogs_pkey" PRIMARY KEY ("company_location_id","catalog_id")
);

-- CreateTable
CREATE TABLE "catalog_items" (
    "id" TEXT NOT NULL,
    "catalog_id" TEXT NOT NULL,
    "shopify_variant_id" TEXT NOT NULL,
    "shopify_product_id" TEXT NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "compare_at_price_cents" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalog_items_pkey" PRIMARY KEY ("id")
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
    "discount_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
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
    "company_id" TEXT NOT NULL,
    "sales_rep_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "shipping_location_id" TEXT,
    "billing_location_id" TEXT,
    "shopify_draft_order_id" TEXT,
    "shopify_order_id" TEXT,
    "shopify_order_number" TEXT,
    "order_number" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'draft',
    "note" TEXT,
    "po_number" TEXT,
    "shipping_method_id" TEXT,
    "subtotal_cents" INTEGER NOT NULL DEFAULT 0,
    "discount_cents" INTEGER NOT NULL DEFAULT 0,
    "shipping_cents" INTEGER NOT NULL DEFAULT 0,
    "tax_cents" INTEGER NOT NULL DEFAULT 0,
    "total_cents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "applied_promotion_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "payment_terms" "PaymentTerms" NOT NULL DEFAULT 'due_on_order',
    "payment_due_date" TIMESTAMP(3),
    "payment_method_id" TEXT,
    "shopify_invoice_id" TEXT,
    "paid_at" TIMESTAMP(3),
    "placed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "refunded_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "revenue_share_reported_at" TIMESTAMP(3),
    "revenue_share_usage_record_id" TEXT,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_timeline_events" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "author_type" "AuthorType" NOT NULL,
    "author_id" TEXT,
    "author_name" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "metadata" JSONB,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_timeline_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_line_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "shopify_product_id" TEXT,
    "shopify_variant_id" TEXT,
    "sku" TEXT,
    "title" TEXT NOT NULL,
    "variant_title" TEXT,
    "image_url" TEXT,
    "quantity" INTEGER NOT NULL,
    "unit_price_cents" INTEGER NOT NULL,
    "discount_cents" INTEGER NOT NULL DEFAULT 0,
    "tax_cents" INTEGER NOT NULL DEFAULT 0,
    "total_cents" INTEGER NOT NULL,
    "is_promotion_item" BOOLEAN NOT NULL DEFAULT false,
    "promotion_id" TEXT,
    "promotion_name" TEXT,
    "fulfilled_quantity" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "shopify_product_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "image_url" TEXT,
    "product_type" TEXT,
    "vendor" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "ProductStatus" NOT NULL DEFAULT 'active',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "enabled_for_field_app" BOOLEAN NOT NULL DEFAULT false,
    "synced_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "shopify_variant_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sku" TEXT,
    "price_cents" INTEGER NOT NULL,
    "compare_price_cents" INTEGER,
    "image_url" TEXT,
    "inventory_quantity" INTEGER,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping_methods" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipping_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotions" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "PromotionType" NOT NULL,
    "scope" "PromotionScope" NOT NULL DEFAULT 'line_item',
    "value" DECIMAL(10,2) NOT NULL,
    "min_order_cents" INTEGER,
    "buy_quantity" INTEGER,
    "buy_product_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "get_quantity" INTEGER,
    "get_product_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "stackable" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rep_quotas" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "rep_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "target_cents" INTEGER NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rep_quotas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_periods" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "plan" "BillingPlan" NOT NULL,
    "included_reps" INTEGER NOT NULL,
    "active_rep_count" INTEGER NOT NULL DEFAULT 0,
    "extra_rep_count" INTEGER NOT NULL DEFAULT 0,
    "per_rep_cents" INTEGER NOT NULL,
    "rep_charges_cents" INTEGER NOT NULL DEFAULT 0,
    "order_revenue_cents" INTEGER NOT NULL DEFAULT 0,
    "revenue_share_percent" DOUBLE PRECISION NOT NULL,
    "revenue_share_cents" INTEGER NOT NULL DEFAULT 0,
    "extra_reps_charged" INTEGER NOT NULL DEFAULT 0,
    "rep_usage_record_id" TEXT,
    "revenue_usage_record_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "finalized_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billed_orders" (
    "id" TEXT NOT NULL,
    "billing_period_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "total_cents" INTEGER NOT NULL,
    "revenue_share_cents" INTEGER NOT NULL,
    "billed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billed_orders_pkey" PRIMARY KEY ("id")
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
CREATE INDEX "territory_states_state_code_idx" ON "territory_states"("state_code");

-- CreateIndex
CREATE UNIQUE INDEX "territory_states_territory_id_state_code_key" ON "territory_states"("territory_id", "state_code");

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
CREATE INDEX "company_locations_territory_id_idx" ON "company_locations"("territory_id");

-- CreateIndex
CREATE UNIQUE INDEX "company_locations_company_id_shopify_location_id_key" ON "company_locations"("company_id", "shopify_location_id");

-- CreateIndex
CREATE UNIQUE INDEX "company_contacts_company_id_email_key" ON "company_contacts"("company_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "company_contacts_company_id_shopify_contact_id_key" ON "company_contacts"("company_id", "shopify_contact_id");

-- CreateIndex
CREATE INDEX "catalogs_shop_id_status_idx" ON "catalogs"("shop_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "catalogs_shop_id_shopify_catalog_id_key" ON "catalogs"("shop_id", "shopify_catalog_id");

-- CreateIndex
CREATE INDEX "company_location_catalogs_catalog_id_idx" ON "company_location_catalogs"("catalog_id");

-- CreateIndex
CREATE INDEX "catalog_items_shopify_variant_id_idx" ON "catalog_items"("shopify_variant_id");

-- CreateIndex
CREATE INDEX "catalog_items_catalog_id_shopify_product_id_idx" ON "catalog_items"("catalog_id", "shopify_product_id");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_items_catalog_id_shopify_variant_id_key" ON "catalog_items"("catalog_id", "shopify_variant_id");

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
CREATE INDEX "orders_shop_id_status_idx" ON "orders"("shop_id", "status");

-- CreateIndex
CREATE INDEX "orders_company_id_idx" ON "orders"("company_id");

-- CreateIndex
CREATE INDEX "orders_sales_rep_id_idx" ON "orders"("sales_rep_id");

-- CreateIndex
CREATE INDEX "orders_created_at_idx" ON "orders"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "orders_shop_id_order_number_key" ON "orders"("shop_id", "order_number");

-- CreateIndex
CREATE UNIQUE INDEX "orders_shop_id_shopify_draft_order_id_key" ON "orders"("shop_id", "shopify_draft_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_shop_id_shopify_order_id_key" ON "orders"("shop_id", "shopify_order_id");

-- CreateIndex
CREATE INDEX "order_timeline_events_order_id_idx" ON "order_timeline_events"("order_id");

-- CreateIndex
CREATE INDEX "order_line_items_order_id_idx" ON "order_line_items"("order_id");

-- CreateIndex
CREATE INDEX "products_shop_id_status_idx" ON "products"("shop_id", "status");

-- CreateIndex
CREATE INDEX "products_shop_id_is_active_idx" ON "products"("shop_id", "is_active");

-- CreateIndex
CREATE INDEX "products_shop_id_enabled_for_field_app_idx" ON "products"("shop_id", "enabled_for_field_app");

-- CreateIndex
CREATE UNIQUE INDEX "products_shop_id_shopify_product_id_key" ON "products"("shop_id", "shopify_product_id");

-- CreateIndex
CREATE INDEX "product_variants_sku_idx" ON "product_variants"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_product_id_shopify_variant_id_key" ON "product_variants"("product_id", "shopify_variant_id");

-- CreateIndex
CREATE INDEX "shipping_methods_shop_id_is_active_idx" ON "shipping_methods"("shop_id", "is_active");

-- CreateIndex
CREATE INDEX "promotions_shop_id_is_active_idx" ON "promotions"("shop_id", "is_active");

-- CreateIndex
CREATE INDEX "promotions_starts_at_ends_at_idx" ON "promotions"("starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "rep_quotas_shop_id_year_month_idx" ON "rep_quotas"("shop_id", "year", "month");

-- CreateIndex
CREATE INDEX "rep_quotas_rep_id_idx" ON "rep_quotas"("rep_id");

-- CreateIndex
CREATE UNIQUE INDEX "rep_quotas_shop_id_rep_id_year_month_key" ON "rep_quotas"("shop_id", "rep_id", "year", "month");

-- CreateIndex
CREATE INDEX "billing_periods_shop_id_status_idx" ON "billing_periods"("shop_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "billing_periods_shop_id_period_start_key" ON "billing_periods"("shop_id", "period_start");

-- CreateIndex
CREATE UNIQUE INDEX "billed_orders_order_id_key" ON "billed_orders"("order_id");

-- CreateIndex
CREATE INDEX "billed_orders_billing_period_id_idx" ON "billed_orders"("billing_period_id");

-- AddForeignKey
ALTER TABLE "sales_reps" ADD CONSTRAINT "sales_reps_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "territories" ADD CONSTRAINT "territories_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "territory_zipcodes" ADD CONSTRAINT "territory_zipcodes_territory_id_fkey" FOREIGN KEY ("territory_id") REFERENCES "territories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "territory_states" ADD CONSTRAINT "territory_states_territory_id_fkey" FOREIGN KEY ("territory_id") REFERENCES "territories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "company_locations" ADD CONSTRAINT "company_locations_territory_id_fkey" FOREIGN KEY ("territory_id") REFERENCES "territories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_contacts" ADD CONSTRAINT "company_contacts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogs" ADD CONSTRAINT "catalogs_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_location_catalogs" ADD CONSTRAINT "company_location_catalogs_company_location_id_fkey" FOREIGN KEY ("company_location_id") REFERENCES "company_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_location_catalogs" ADD CONSTRAINT "company_location_catalogs_catalog_id_fkey" FOREIGN KEY ("catalog_id") REFERENCES "catalogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_catalog_id_fkey" FOREIGN KEY ("catalog_id") REFERENCES "catalogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "orders" ADD CONSTRAINT "orders_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_sales_rep_id_fkey" FOREIGN KEY ("sales_rep_id") REFERENCES "sales_reps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "company_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipping_location_id_fkey" FOREIGN KEY ("shipping_location_id") REFERENCES "company_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_billing_location_id_fkey" FOREIGN KEY ("billing_location_id") REFERENCES "company_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipping_method_id_fkey" FOREIGN KEY ("shipping_method_id") REFERENCES "shipping_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_timeline_events" ADD CONSTRAINT "order_timeline_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_line_items" ADD CONSTRAINT "order_line_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping_methods" ADD CONSTRAINT "shipping_methods_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rep_quotas" ADD CONSTRAINT "rep_quotas_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rep_quotas" ADD CONSTRAINT "rep_quotas_rep_id_fkey" FOREIGN KEY ("rep_id") REFERENCES "sales_reps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_periods" ADD CONSTRAINT "billing_periods_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billed_orders" ADD CONSTRAINT "billed_orders_billing_period_id_fkey" FOREIGN KEY ("billing_period_id") REFERENCES "billing_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billed_orders" ADD CONSTRAINT "billed_orders_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

