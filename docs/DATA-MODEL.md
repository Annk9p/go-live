# GO LIVE — Data Model (Phase 2)

ไฟล์จริง: [`prisma/schema.prisma`](../prisma/schema.prisma) · SQL: [`prisma/migrations/0001_init/migration.sql`](../prisma/migrations/0001_init/migration.sql)
ชนิดข้อมูลฝั่งหน้าเว็บ: [`lib/types.ts`](../lib/types.ts) (ชื่อฟิลด์ตรงกัน)

## ความสัมพันธ์

```
platforms (SHOPEE | TIKTOK)            ← enum + ตาราง seed 2 แถว (ไม่มี Brand, ไม่มี Lazada)
   └─< shops (platform_code, name)      ← unique(platform_code, name) · Dynamic list ใน Sidebar
          └─< schedules >─ members      ← FK (shop_id, platform_code) บังคับว่า Platform ของตารางตรงกับร้าน
                   │         (is_host)
                   └─> import_batches ──< import_errors
                              │        └─< schedule_backups (snapshot ก่อน Replace → Rollback)
                              └─> sync_sources (Google Sheets URL + Scope + last_hash)
settings · audit_logs
```

## การตัดสินใจหลัก

| เรื่อง | ทำอย่างไร | เหตุผล |
|---|---|---|
| Platform มีแค่ 2 | `enum PlatformCode` + ตาราง `platforms` | DB ปฏิเสธค่าอื่น (เช่น Lazada) เอง |
| Shop แยกตาม Platform | `shops.platform_code` + unique(platform, name) | ชื่อร้านซ้ำข้าม Platform ได้ แต่ไม่ซ้ำใน Platform เดียว |
| Schedule ตรงกับ Platform ของร้าน | composite FK `(shop_id, platform_code)` → `shops(id, platform_code)` | ป้องกันตาราง TikTok ชี้ไปร้าน Shopee |
| ไม่สร้างข้อมูลซ้ำตอน Sync | `schedules.id` = hash ของ `platform\|shop\|host\|date\|start\|end` | นำเข้าชีตเดิมกี่ครั้งก็ได้แถวเดิม |
| Auto Sync ไม่นำเข้าซ้ำ | `sync_sources.last_hash` (SHA-256 ของ CSV) / `last_revision` | Hash เท่าเดิม = ข้าม |
| Replace เฉพาะ Scope | ลบ/แทรกเฉพาะ `WHERE date in month AND platform_code = ? [AND shop_id = ?]` ใน transaction เดียว | ข้อมูล Platform/Shop/เดือนอื่นไม่ถูกแตะ |
| Validation ไม่ผ่าน | บันทึก `import_batches(status=REJECTED)` + `import_errors` แล้ว **ไม่** แตะ `schedules` | ข้อมูลเดิมที่ผ่านการตรวจยังอยู่ครบ |
| Backup / Rollback | `schedule_backups.rows` (JSON) ต่อ batch · Rollback = แทนที่ Scope ด้วย snapshot | ต้อง Rollback จากใหม่ไปเก่าใน Scope เดียวกัน |
| Timezone | `date` + `start_time/end_time` (เวลากรุงเทพฯ) และ `starts_at/ends_at` (timestamptz) | แสดงผลตามที่กรอก + query ช่วงเวลา/Conflict ได้เร็ว |
| Conflict | `a.starts_at < b.ends_at AND a.ends_at > b.starts_at` และ (`a.host_id = b.host_id` หรือ `a.shop_id = b.shop_id`) · index `(host_id, date)`, `(platform_code, shop_id, date)` | คนละร้านคนละ Host ไลฟ์พร้อมกันได้ · Host คนเดียวกันซ้อนไม่ได้ (ข้ามร้าน/Platform) · ร้านเดียวกันซ้อนไม่ได้ · ชนขอบพอดี (10:00 จบ/10:00 เริ่ม) ไม่นับ |

## รูปแบบ Google Sheets (ต้นทาง)

| คอลัมน์ | บังคับ | ตัวอย่าง | หมายเหตุ |
|---|---|---|---|
| `date` | ✓ | `2026-12-01` หรือ `01/12/2569` | รองรับปี พ.ศ. |
| `start_time` | ✓ | `09:00` / `9.00` | |
| `end_time` | ✓ | `11:00` | น้อยกว่าเวลาเริ่ม = ข้ามเที่ยงคืน · ยาวสุด 12 ชม. |
| `platform` | ✓ | `Shopee` / `TikTok` | ค่าอื่นไม่ผ่าน |
| `shop_name` หรือ `shop_id` | ✓ | `EloopTH` | ต้องมีร้านนี้ใน Platform นั้นแล้ว (เพิ่มที่ “จัดการร้านค้า”) · ชื่อเดียวกันใน Shopee/TikTok แยกกันด้วยคอลัมน์ platform |
| `host_name` หรือ `host_id` | ✓ | `มิ้นท์` | จับคู่กับชื่อหรือชื่อเล่นของพนักงานที่เป็น Host |
| `status` | | `scheduled` / `live` / `done` / `cancelled` | ว่าง = scheduled |

หัวคอลัมน์ภาษาไทยใช้ได้ (`วันที่`, `เวลาเริ่ม`, `เวลาสิ้นสุด`, `แพลตฟอร์ม`, `ร้าน`, `โฮสต์`, `สถานะ`)

**Central Google Sheet (ฐานข้อมูลกลาง):** ใน Phase 3 ระบบจะเขียนผลที่ผ่าน Validation กลับไปที่ชีตกลาง 1 แท็บต่อเดือน (`YYYY-MM`) ด้วยคอลัมน์เดียวกับตาราง `schedules` เพื่อให้ทีมเปิดดูได้ — ส่วน PostgreSQL เป็นที่เก็บหลักของเว็บ
