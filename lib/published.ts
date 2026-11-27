// ข้อมูลกลางที่ "เผยแพร่" พร้อมเว็บ (public/data/schedule.json)
// สร้างโดยสคริปต์ Sync บน GitHub Actions จาก Google Sheets ทุก 30 นาที → ทุกคนที่เปิดเว็บเห็นข้อมูลชุดเดียวกัน
import type { Member, PlatformCode, Schedule, Shop } from "./types.ts";
import { fnv, scheduleId } from "./import.ts";
import { REAL_SHOPS } from "./mock-data.ts";
import { mergeSlots, type MatrixIssue, type MatrixResult } from "./sheet-matrix.ts";

export type TabStatus = "OK" | "ERROR_KEPT" | "SKIPPED";
export interface PublishedTab {
  name: string;
  platform: PlatformCode | null;
  month: string | null;
  status: TabStatus; // ERROR_KEPT = ไม่ผ่านการตรวจ → ไม่แทนที่ คงข้อมูลเดิมของเดือน + Platform นี้ไว้
  sessions: number;
  shops: string[];
  errors: MatrixIssue[];
  warnings: MatrixIssue[];
}
export interface PublishedData {
  version: 1;
  generatedAt: string;
  hash: string; // เปลี่ยนเมื่อข้อมูลในชีตเปลี่ยนเท่านั้น (ใช้ข้ามการ deploy เมื่อไม่มีอะไรใหม่)
  source: { title: string; url: string };
  tabs: PublishedTab[];
  shops: Shop[];
  members: Member[];
  schedules: Schedule[];
}

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9ก-๙]+/g, "_").replace(/^_|_$/g, "");
export const shopIdOf = (platform: PlatformCode, name: string) => `shp_${platform.toLowerCase()}_${slug(name)}`;
export const hostIdOf = (name: string) => `host_${slug(name)}`;
export const titleCase = (s: string) => s.trim().toLowerCase().replace(/(^|[\s_-])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());

/** ชื่อร้านมาตรฐาน: ถ้าตรงกับร้านจริงที่รู้จัก (ไม่สนตัวพิมพ์) ใช้ชื่อนั้น เช่น "ELOOPTH" → "EloopTH" */
export function canonicalShopName(platform: PlatformCode, raw: string) {
  const hit = REAL_SHOPS.find(([p, n]) => p === platform && n.toLowerCase() === raw.trim().toLowerCase());
  return hit ? hit[1] : raw.trim();
}

/** สีประจำ Host: แต่ละชื่อมี "ช่องสี" ที่อยากได้จาก hash ของชื่อ (คงที่ทุกครั้งที่ Sync)
 *  ถ้าช่องนั้นมีคนใช้แล้ว เลื่อนไปช่องว่างถัดไป → สีไม่ซ้ำกัน และเปลี่ยนเฉพาะเมื่อชนกัน
 *  24 เฉด (ห่าง 15°) × 2 ระดับความเข้ม = 48 สี เรียงสลับให้ช่องติดกันต่างกันชัด */
const HOST_PALETTE = Array.from({ length: 48 }, (_, i) => {
  const hue = ((i % 24) * 105) % 360; // กระโดด 105° → สีที่อยู่ติดกันในลิสต์ต่างกันมาก
  return hslToHex(hue, 65, i < 24 ? 42 : 55);
});
export function assignHostColors(names: string[]): Map<string, string> {
  const used = new Set<number>();
  const out = new Map<string, string>();
  for (const name of [...names].sort()) {
    let h = 0;
    for (const ch of name.toUpperCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    let slot = h % HOST_PALETTE.length;
    while (used.has(slot) && used.size < HOST_PALETTE.length) slot = (slot + 1) % HOST_PALETTE.length;
    used.add(slot);
    out.set(name, HOST_PALETTE[slot]);
  }
  return out;
}
function hslToHex(h: number, s: number, l: number) {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return "#" + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("");
}

interface ParsedTab { name: string; result: MatrixResult | null }

/**
 * รวมผลการอ่านทุกแท็บเป็นข้อมูลกลาง
 * - แท็บที่ผ่าน → ใช้ข้อมูลใหม่ทั้งเดือน + Platform นั้น (Replace ตาม Scope)
 * - แท็บที่ไม่ผ่าน → ไม่แทนที่ คงข้อมูลเดิมจากรอบก่อน (previous) ของเดือน + Platform นั้น
 */
export function buildPublished(tabs: ParsedTab[], opts: { title: string; url: string; now: string; previous?: PublishedData | null }): PublishedData {
  const outTabs: PublishedTab[] = [];
  const schedules: Schedule[] = [];
  const shops = new Map<string, Shop>();
  // ร้านจริงที่รู้จักแสดงเสมอ (แม้เดือนนี้ยังไม่มีบล็อกในชีต)
  REAL_SHOPS.forEach(([platform, name], i) => shops.set(shopIdOf(platform, name), { id: shopIdOf(platform, name), platform, name, active: true, sortOrder: i, createdAt: opts.now }));
  const scopeKey = (p: PlatformCode, month: string) => `${p}|${month}`;
  const done = new Set<string>();

  for (const t of tabs) {
    const r = t.result;
    if (!r) { outTabs.push({ name: t.name, platform: null, month: null, status: "SKIPPED", sessions: 0, shops: [], errors: [], warnings: [{ row: 0, message: "ชื่อแท็บไม่ใช่รูปแบบ \"Shopee MM/YYYY\" หรือ \"Tiktok MM/YYYY\" — ข้ามแท็บนี้" }] }); continue; }
    const key = scopeKey(r.tab.platform, r.tab.month);
    if (done.has(key)) {
      outTabs.push({ name: t.name, platform: r.tab.platform, month: r.tab.month, status: "ERROR_KEPT", sessions: 0, shops: r.shops, errors: [{ row: 0, message: `มีแท็บของ ${r.tab.platform} ${r.tab.month} ซ้ำกัน — ใช้แท็บแรกเท่านั้น` }], warnings: [] });
      continue;
    }
    done.add(key);
    if (r.errors.length) {
      const kept = (opts.previous?.schedules ?? []).filter((s) => s.platform === r.tab.platform && s.date.startsWith(r.tab.month));
      schedules.push(...kept);
      for (const s of kept) if (!shops.has(s.shopId)) { const ps = opts.previous?.shops.find((x) => x.id === s.shopId); if (ps) shops.set(ps.id, ps); }
      outTabs.push({ name: t.name, platform: r.tab.platform, month: r.tab.month, status: "ERROR_KEPT", sessions: kept.length, shops: r.shops, errors: r.errors, warnings: r.warnings });
      continue;
    }
    const merged = mergeSlots(r.slots);
    for (const s of merged) {
      const shopName = canonicalShopName(r.tab.platform, s.shopName);
      const shopId = shopIdOf(r.tab.platform, shopName);
      if (!shops.has(shopId)) shops.set(shopId, { id: shopId, platform: r.tab.platform, name: shopName, active: true, sortOrder: 100 + shops.size, createdAt: opts.now });
      const hostName = titleCase(s.host);
      const base = { platform: r.tab.platform, shopId, hostId: hostIdOf(s.host), date: s.date, startTime: s.startTime, endTime: s.endTime };
      schedules.push({ ...base, id: scheduleId(base), shopName, hostName, status: "SCHEDULED", source: `gsheet:${t.name}`, importRef: null, updatedAt: opts.now });
    }
    outTabs.push({ name: t.name, platform: r.tab.platform, month: r.tab.month, status: "OK", sessions: merged.length, shops: r.shops.map((n) => canonicalShopName(r.tab.platform, n)), errors: [], warnings: r.warnings });
  }

  // Host = ทุกคนที่มีชื่อในตาราง
  const hostNames = new Map<string, string>();
  for (const s of schedules) hostNames.set(s.hostId, s.hostName);
  const colors = assignHostColors([...hostNames.values()]);
  const members: Member[] = [...hostNames.entries()]
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([id, name]) => ({ id, name, nickname: name, email: "", role: "EMPLOYEE", isHost: true, color: colors.get(name)!, active: true }));

  schedules.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.shopId.localeCompare(b.shopId));
  const shopList = [...shops.values()].sort((a, b) => a.sortOrder - b.sortOrder);
  const hash = fnv(JSON.stringify([shopList.map((s) => [s.id, s.name]), members.map((m) => [m.id, m.name]), schedules.map((s) => s.id), outTabs.map((t) => [t.name, t.status, t.errors.length])]));
  return { version: 1, generatedAt: opts.now, hash, source: { title: opts.title, url: opts.url }, tabs: outTabs, shops: shopList, members, schedules };
}
