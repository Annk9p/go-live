// ข้อมูลตัวอย่าง (MOCK) สำหรับทดสอบ UI ใน Phase 1 เท่านั้น
// ร้านค้าเป็นร้านจริง (REAL_SHOPS) · พนักงานและตารางไลฟ์เป็นตัวอย่าง ติด isDemo = true และ source = "MOCK"
// ล้างทิ้งได้ที่หน้า "ตั้งค่าระบบ" ก่อนใช้งานจริง — ร้านจริงจะยังอยู่
import type { Db, Member, Schedule, Shop } from "./types.ts";
import { addDays, fromMinutes, todayBangkok } from "./time.ts";
import { scheduleId } from "./import.ts";

function seeded(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

export const DB_VERSION = 4;

/** ร้านจริงของบริษัท (ไม่ใช่ข้อมูลตัวอย่าง) — ชื่อเดียวกันข้าม Platform ได้ เพราะ Shop สังกัด Platform เดียว
 *  ร้านใหม่เพิ่มได้ที่หน้า "จัดการร้านค้า" โดยไม่ต้องแก้โค้ด */
export const REAL_SHOPS: ReadonlyArray<readonly [Shop["platform"], string]> = [
  ["SHOPEE", "EloopTH"], ["SHOPEE", "MoovTH"], ["SHOPEE", "EloopPB"],
  ["TIKTOK", "EloopTH"], ["TIKTOK", "MoovTH"],
];

export function realShops(now: string): Shop[] {
  const order: Record<string, number> = {};
  return REAL_SHOPS.map(([platform, name]) => ({
    id: `shp_${platform.toLowerCase()}_${name.toLowerCase()}`, platform, name, active: true,
    sortOrder: (order[platform] = (order[platform] ?? -1) + 1), createdAt: now,
  }));
}

export function defaultSettings(): Db["settings"] {
  return { autoSyncEnabled: false, autoSyncIntervalMin: 30, employeeTeamView: "ALL", dayStartHour: 8, dayEndHour: 24, slotMinutes: 60 };
}

export function buildMockDb(): Db {
  const now = new Date().toISOString();
  const shops = realShops(now);

  const members: Member[] = [
    { id: "mem_admin", name: "ผู้ดูแลระบบ (Demo)", nickname: "Admin", email: "admin@example.com", role: "ADMIN", isHost: false, color: "#5b5bd6", active: true, isDemo: true },
    ...([
      ["Demo มิ้นท์", "มิ้นท์", "#0e9f8f"], ["Demo ฝน", "ฝน", "#db2777"], ["Demo บอส", "บอส", "#2563eb"],
      ["Demo แพร", "แพร", "#d97706"], ["Demo ต้น", "ต้น", "#7c3aed"], ["Demo เจน", "เจน", "#0891b2"],
    ] as const).map(([name, nickname, color], i): Member => ({
      id: `mem_host_${i + 1}`, name, nickname, email: `host${i + 1}@example.com`, role: "EMPLOYEE", isHost: true, color, active: true, isDemo: true,
    })),
  ];
  const hosts = members.filter((m) => m.isHost);

  const rnd = seeded(20261126);
  const today = todayBangkok();
  const schedules: Schedule[] = [];
  const first = "2026-11-01";
  for (let d = 0; d < 61; d++) {
    const date = addDays(first, d);
    let t = 9 * 60 + Math.floor(rnd() * 2) * 30;
    let slot = 0;
    while (t < 23 * 60) {
      const dur = [60, 90, 120, 120, 180][Math.floor(rnd() * 5)];
      let start = t;
      // จงใจให้ซ้อนกันบางวันเพื่อทดสอบ Conflict Detection
      if (slot === 3 && d % 4 === 1) start = t - 30;
      const end = Math.min(start + dur, 24 * 60);
      const shop = shops[Math.floor(rnd() * shops.length)];
      const host = hosts[Math.floor(rnd() * hosts.length)];
      const base = { platform: shop.platform, shopId: shop.id, hostId: host.id, date, startTime: fromMinutes(start), endTime: fromMinutes(end) };
      const past = date < today;
      const status: Schedule["status"] = rnd() < 0.04 ? "CANCELLED" : past ? "DONE" : "SCHEDULED";
      schedules.push({
        ...base, id: scheduleId(base), shopName: shop.name, hostName: host.name, status,
        source: "MOCK", importRef: null, updatedAt: now, isDemo: true,
      });
      t = end + (rnd() < 0.3 ? 30 : 0);
      slot++;
    }
  }

  return {
    version: DB_VERSION, shops, members, schedules, imports: [], importErrors: [], sources: [],
    settings: defaultSettings(),
    audit: [{ id: "aud_init", at: now, actor: "system", action: "seed", detail: "สร้างข้อมูลตัวอย่าง (MOCK) สำหรับทดสอบ UI" }],
    currentUserId: "mem_admin",
  };
}
