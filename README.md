# GO LIVE

ระบบจัดการตารางไลฟ์ของพนักงาน (Shopee / TikTok) — Next.js 15 (App Router) · TypeScript strict · OMNIX Design System · Recharts · Prisma (PostgreSQL)

## เริ่มใช้งาน

```bash
npm install
npm run dev        # http://localhost:3100
npm test           # unit test: conflict / validation / replace scope
npm run typecheck
```

มุมขวาบนมีตัวเลือก “เข้าสู่ระบบเป็น” สำหรับสลับ Admin / Employee (จำลองการ Login ใน Phase 1)

## สถานะ

- **Phase 1 (เสร็จ):** Layout + Sidebar (dynamic shop list, expand/collapse), 13 หน้า, Matrix / Calendar (วัน/สัปดาห์/เดือน), ตัวกรองทุกหน้า, Conflict Detection ระดับ Global, Import Center (Preview → Validate → Replace เฉพาะ Scope, History, Error Log, Backup, Rollback, Auto Sync ด้วย SHA-256), จัดการร้าน/พนักงาน, รายงาน, ตั้งค่า + Audit Log — ข้อมูลเก็บในเบราว์เซอร์ (localStorage) ผ่าน `lib/store.tsx`
- **Phase 2 (เสร็จ):** Database schema ที่ `prisma/schema.prisma` + migration SQL — ดูคำอธิบายที่ [docs/DATA-MODEL.md](docs/DATA-MODEL.md)
- **ถัดไป:** API (NestJS) + Login จริง + ย้าย Auto Sync ไป cron ฝั่งเซิร์ฟเวอร์ + i18n ไทย/English/中文

## โครงสร้าง

```
app/                     หน้าเว็บ (schedule/me, schedule/team, platform/[slug], shop/[shopId], team/*, admin/*)
app/api/sheet/route.ts   proxy ดึง CSV จาก Google Sheets (รับเฉพาะ docs.google.com)
components/              AppShell (Sidebar), ScheduleBoard (Matrix/Calendar), ui, charts, icons (generated)
lib/                     types, time (Asia/Bangkok), conflicts, import, sync, store, visibility, stats, mock-data
prisma/                  schema + migration
tests/                   node:test
```

ร้านค้าตั้งต้นเป็นร้านจริง: Shopee — EloopTH, MoovTH, EloopPB · TikTok — EloopTH, MoovTH (กำหนดใน `REAL_SHOPS` ของ `lib/mock-data.ts`, เพิ่มร้านใหม่ได้ที่หน้า “จัดการร้านค้า”)

พนักงานและตารางไลฟ์ที่ติดป้าย “ข้อมูลตัวอย่าง” (ชื่อขึ้นต้นด้วย “Demo”) ใช้ทดสอบ UI เท่านั้น — ล้างได้ที่ ตั้งค่าระบบ → ล้างข้อมูลตัวอย่าง (ร้านจริงจะไม่ถูกลบ)

## ขึ้น GitHub Pages (ลิงก์ที่เปิดได้ตลอด)

- `.github/workflows/pages.yml` จะ build แล้วนำเว็บขึ้น GitHub Pages ให้ทุกครั้งที่ push เข้า `main` และกดสั่งรันเองได้ที่แท็บ Actions
- build ด้วยคำสั่ง `npm run build:pages` ได้เว็บแบบไฟล์ล้วนในโฟลเดอร์ `out/` (ใช้ `NEXT_BASE_PATH=/ชื่อ-repo`)
- บน GitHub Pages ไม่มีเซิร์ฟเวอร์ จึงไม่มี proxy `/api/sheet`
  - เบราว์เซอร์ดึงชีตจาก Google โดยตรง ชีตต้องแชร์แบบ "ทุกคนที่มีลิงก์ดูได้" หรือเผยแพร่เป็น CSV
  - ถ้าดึงไม่ได้ ให้ใช้วิธีวาง CSV แทน
- หน้าร้านใช้ที่อยู่แบบ `/shop?id=<shop_id>` เพื่อให้เพิ่มร้านใหม่ได้โดยไม่ต้อง build ใหม่
