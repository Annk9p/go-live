// โครงสร้างข้อมูลหลัก: Platform → Shop → Schedule → Host
// ไม่มี Brand ในโครงสร้าง · Platform มีเพียง Shopee และ TikTok ในเวอร์ชันนี้
// ชนิดข้อมูลชุดนี้ตรงกับ prisma/schema.prisma (Phase 2)

export type PlatformCode = "SHOPEE" | "TIKTOK";

export interface Platform {
  code: PlatformCode;
  slug: "shopee" | "tiktok";
  name: string;
}

export const PLATFORMS: readonly Platform[] = [
  { code: "SHOPEE", slug: "shopee", name: "Shopee" },
  { code: "TIKTOK", slug: "tiktok", name: "TikTok" },
] as const;

export const platformBySlug = (slug: string) => PLATFORMS.find((p) => p.slug === slug);
export const platformByCode = (code: PlatformCode) => PLATFORMS.find((p) => p.code === code)!;

export interface Shop {
  id: string;
  platform: PlatformCode;
  name: string;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  isDemo?: boolean;
}

export type Role = "ADMIN" | "EMPLOYEE";

/** พนักงาน (ผู้ใช้ระบบ) — คนที่ isHost = true จะปรากฏเป็น Host ในตาราง */
export interface Member {
  id: string;
  name: string;
  nickname: string;
  email: string;
  role: Role;
  isHost: boolean;
  color: string; // สีประจำตัว Host (hex จากข้อมูล)
  active: boolean;
  isDemo?: boolean;
}

export type ScheduleStatus = "SCHEDULED" | "LIVE" | "DONE" | "CANCELLED";

export const STATUS_LABEL: Record<ScheduleStatus, string> = {
  SCHEDULED: "ตามกำหนด",
  LIVE: "กำลังไลฟ์",
  DONE: "เสร็จแล้ว",
  CANCELLED: "ยกเลิก",
};

export interface Schedule {
  id: string; // Schedule ID — สร้างจาก key ของรายการ เพื่อไม่ให้ซ้ำเมื่อ Sync
  date: string; // YYYY-MM-DD (Asia/Bangkok)
  startTime: string; // HH:mm
  endTime: string; // HH:mm (น้อยกว่า start = ข้ามเที่ยงคืน)
  platform: PlatformCode;
  shopId: string;
  shopName: string;
  hostId: string;
  hostName: string;
  status: ScheduleStatus;
  source: string; // Source / Import Reference เช่น "MOCK", "manual:imp_xxx", "auto:src_xxx"
  importRef: string | null;
  updatedAt: string; // ISO
  isDemo?: boolean;
}

export interface ImportScope {
  month: string; // YYYY-MM
  platform: PlatformCode;
  shopId: string | "ALL";
}

export type ImportStatus = "APPLIED" | "REJECTED" | "SKIPPED_NO_CHANGE" | "ROLLED_BACK";

export interface ImportBatch {
  id: string;
  createdAt: string;
  trigger: "MANUAL" | "AUTO";
  sourceName: string;
  scope: ImportScope;
  status: ImportStatus;
  rowCount: number;
  added: number;
  removed: number;
  unchanged: number;
  errorCount: number;
  hash: string;
  actor: string;
  /** สำเนาข้อมูลเดิมใน Scope ก่อน Replace — ใช้ Rollback */
  backup?: Schedule[];
  rolledBackAt?: string;
}

export interface ImportError {
  id: string;
  batchId: string;
  createdAt: string;
  row: number;
  field: string;
  message: string;
}

export interface SyncSource {
  id: string;
  name: string;
  csvUrl: string;
  platform: PlatformCode;
  shopId: string | "ALL";
  enabled: boolean;
  lastHash: string | null;
  lastSyncedAt: string | null;
  lastStatus: string | null;
}

export interface Settings {
  autoSyncEnabled: boolean;
  autoSyncIntervalMin: number;
  employeeTeamView: "ALL" | "OWN_SHOPS";
  dayStartHour: number;
  dayEndHour: number;
  slotMinutes: 30 | 60;
}

export interface AuditLog {
  id: string;
  at: string;
  actor: string;
  action: string;
  detail: string;
}

export interface Db {
  version: number;
  shops: Shop[];
  members: Member[];
  schedules: Schedule[];
  imports: ImportBatch[];
  importErrors: ImportError[];
  sources: SyncSource[];
  settings: Settings;
  audit: AuditLog[];
  currentUserId: string;
  /** ข้อมูลกลางที่ซิงก์จาก Google Sheets (มีเมื่อเว็บโหลด data/schedule.json ได้) */
  published?: PublishedMeta;
}

export interface PublishedMeta {
  generatedAt: string;
  hash: string;
  source: { title: string; url: string };
  tabs: { name: string; platform: PlatformCode | null; month: string | null; status: "OK" | "ERROR_KEPT" | "SKIPPED"; sessions: number; shops: string[]; errors: { row: number; message: string }[]; warnings: { row: number; message: string }[] }[];
}
