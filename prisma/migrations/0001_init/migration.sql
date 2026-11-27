-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PlatformCode" AS ENUM ('SHOPEE', 'TIKTOK');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('SCHEDULED', 'LIVE', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ImportTrigger" AS ENUM ('MANUAL', 'AUTO');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('APPLIED', 'REJECTED', 'SKIPPED_NO_CHANGE', 'ROLLED_BACK');

-- CreateTable
CREATE TABLE "platforms" (
    "code" "PlatformCode" NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "platforms_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "shops" (
    "id" TEXT NOT NULL,
    "platform_code" "PlatformCode" NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "members" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nickname" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'EMPLOYEE',
    "is_host" BOOLEAN NOT NULL DEFAULT true,
    "color" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedules" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "start_time" VARCHAR(5) NOT NULL,
    "end_time" VARCHAR(5) NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "platform_code" "PlatformCode" NOT NULL,
    "shop_id" TEXT NOT NULL,
    "shop_name" TEXT NOT NULL,
    "host_id" TEXT NOT NULL,
    "host_name" TEXT NOT NULL,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'SCHEDULED',
    "source" TEXT NOT NULL,
    "import_ref" TEXT,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_sources" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "csv_url" TEXT NOT NULL,
    "platform_code" "PlatformCode" NOT NULL,
    "shop_id" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_hash" TEXT,
    "last_revision" TEXT,
    "last_synced_at" TIMESTAMPTZ(3),
    "last_status" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trigger" "ImportTrigger" NOT NULL,
    "source_id" TEXT,
    "source_name" TEXT NOT NULL,
    "scope_month" CHAR(7) NOT NULL,
    "scope_platform" "PlatformCode" NOT NULL,
    "scope_shop_id" TEXT,
    "status" "ImportStatus" NOT NULL,
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "added" INTEGER NOT NULL DEFAULT 0,
    "removed" INTEGER NOT NULL DEFAULT 0,
    "unchanged" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "content_hash" TEXT NOT NULL,
    "actor_id" TEXT,
    "rolled_back_at" TIMESTAMPTZ(3),

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_errors" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "row" INTEGER NOT NULL,
    "field" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_errors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_backups" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "rows" JSONB NOT NULL,
    "row_count" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_backups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "detail" TEXT NOT NULL,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shops_platform_code_active_sort_order_idx" ON "shops"("platform_code", "active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "shops_platform_code_name_key" ON "shops"("platform_code", "name");

-- CreateIndex
CREATE UNIQUE INDEX "shops_id_platform_code_key" ON "shops"("id", "platform_code");

-- CreateIndex
CREATE UNIQUE INDEX "members_email_key" ON "members"("email");

-- CreateIndex
CREATE INDEX "members_is_host_active_idx" ON "members"("is_host", "active");

-- CreateIndex
CREATE INDEX "schedules_platform_code_shop_id_date_idx" ON "schedules"("platform_code", "shop_id", "date");

-- CreateIndex
CREATE INDEX "schedules_host_id_date_idx" ON "schedules"("host_id", "date");

-- CreateIndex
CREATE INDEX "schedules_date_idx" ON "schedules"("date");

-- CreateIndex
CREATE INDEX "schedules_starts_at_ends_at_idx" ON "schedules"("starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "import_batches_scope_month_scope_platform_scope_shop_id_cre_idx" ON "import_batches"("scope_month", "scope_platform", "scope_shop_id", "created_at");

-- CreateIndex
CREATE INDEX "import_batches_created_at_idx" ON "import_batches"("created_at");

-- CreateIndex
CREATE INDEX "import_errors_batch_id_idx" ON "import_errors"("batch_id");

-- CreateIndex
CREATE INDEX "schedule_backups_batch_id_idx" ON "schedule_backups"("batch_id");

-- CreateIndex
CREATE INDEX "audit_logs_at_idx" ON "audit_logs"("at");

-- AddForeignKey
ALTER TABLE "shops" ADD CONSTRAINT "shops_platform_code_fkey" FOREIGN KEY ("platform_code") REFERENCES "platforms"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_shop_id_platform_code_fkey" FOREIGN KEY ("shop_id", "platform_code") REFERENCES "shops"("id", "platform_code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_import_ref_fkey" FOREIGN KEY ("import_ref") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_sources" ADD CONSTRAINT "sync_sources_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sync_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_errors" ADD CONSTRAINT "import_errors_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_backups" ADD CONSTRAINT "schedule_backups_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ===== เพิ่มเติมด้วยมือ =====
-- Seed Platform (มีเพียง 2 แถว ห้ามเพิ่ม Lazada หรือ Platform อื่นในเวอร์ชันนี้)
INSERT INTO "platforms" ("code", "name", "color", "sortOrder") VALUES
  ('SHOPEE', 'Shopee', '#F97316', 0),
  ('TIKTOK', 'TikTok', '#171717', 1);

-- รูปแบบเวลา HH:mm และช่วงเวลาต้องไม่ว่าง
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_time_format_chk"
  CHECK ("start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "end_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_range_chk" CHECK ("ends_at" > "starts_at");
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_month_chk" CHECK ("scope_month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

-- ตัวอย่าง query ตรวจ Conflict: เวลาซ้อน (start_A < end_B AND end_A > start_B)
-- เฉพาะ Host คนเดียวกัน (ข้ามร้าน/Platform) หรือร้านเดียวกัน — คนละร้านคนละ Host ไลฟ์พร้อมกันได้
-- SELECT a.id, b.id FROM schedules a JOIN schedules b
--   ON a.id < b.id AND a.starts_at < b.ends_at AND a.ends_at > b.starts_at
--  AND (a.host_id = b.host_id OR a.shop_id = b.shop_id)
--  WHERE a.status <> 'CANCELLED' AND b.status <> 'CANCELLED'
--    AND a.starts_at < $2 AND a.ends_at > $1;   -- จำกัดช่วงเวลาที่ดู
