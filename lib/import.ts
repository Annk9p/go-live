// นำเข้าข้อมูลจาก Google Sheets (CSV): Parse → Validate → Preview/Diff → Replace เฉพาะ Scope
// กติกา: Validation ไม่ผ่าน = ห้าม Replace · ห้ามแตะข้อมูลนอก Scope · ID คงที่เพื่อไม่ให้ซ้ำเมื่อ Sync
import type { ImportScope, Member, PlatformCode, Schedule, ScheduleStatus, Shop } from "./types.ts";
import { detectConflicts } from "./conflicts.ts";
import { toMinutes } from "./time.ts";

/* ---------- CSV ---------- */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v.trim() !== "")) rows.push(row);
  return rows;
}

/* ---------- Hash ---------- */
/** FNV-1a 53-bit — ใช้สร้าง Schedule ID ที่คงที่ (sync, ไม่ต้อง async) */
export function fnv(str: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 ^ c, 2246822507);
  }
  return ((h2 >>> 0) & 0x1fffff).toString(36) + (h1 >>> 0).toString(36);
}

/** SHA-256 ของเนื้อหา — ใช้ตรวจว่าชีตเปลี่ยนหรือไม่ (Auto Sync) */
export async function contentHash(text: string): Promise<string> {
  const norm = text.replace(/\r\n/g, "\n").trim();
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(norm));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function scheduleKey(s: Pick<Schedule, "platform" | "shopId" | "hostId" | "date" | "startTime" | "endTime">) {
  return `${s.platform}|${s.shopId}|${s.hostId}|${s.date}|${s.startTime}|${s.endTime}`;
}
export const scheduleId = (s: Parameters<typeof scheduleKey>[0]) => "sch_" + fnv(scheduleKey(s));

/* ---------- Header mapping ---------- */
const HEADERS: Record<string, string[]> = {
  date: ["date", "วันที่", "live_date"],
  start: ["start", "start_time", "starttime", "เวลาเริ่ม", "เริ่ม"],
  end: ["end", "end_time", "endtime", "เวลาสิ้นสุด", "เวลาจบ", "จบ"],
  platform: ["platform", "แพลตฟอร์ม"],
  shopId: ["shop_id", "shopid", "รหัสร้าน"],
  shop: ["shop", "shop_name", "shopname", "ร้าน", "ชื่อร้าน"],
  hostId: ["host_id", "hostid", "รหัสโฮสต์"],
  host: ["host", "host_name", "hostname", "โฮสต์", "ชื่อโฮสต์", "พนักงาน"],
  status: ["status", "สถานะ"],
};
export const TEMPLATE_HEADER = "date,start_time,end_time,platform,shop_name,host_name,status";

function mapHeader(header: string[]) {
  const idx: Record<string, number> = {};
  header.forEach((h, i) => {
    const k = h.trim().toLowerCase().replace(/\s+/g, "_");
    for (const [field, names] of Object.entries(HEADERS)) if (names.includes(k) && idx[field] === undefined) idx[field] = i;
  });
  return idx;
}

/* ---------- Field parsers ---------- */
export function parseDate(v: string): string | null {
  const t = v.trim();
  let y: number, m: number, d: number;
  let mt = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (mt) [y, m, d] = [+mt[1], +mt[2], +mt[3]];
  else if ((mt = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) [d, m, y] = [+mt[1], +mt[2], +mt[3]];
  else return null;
  if (y > 2400) y -= 543; // ปี พ.ศ.
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

export function parseTime(v: string): string | null {
  const mt = v.trim().match(/^(\d{1,2})[:.](\d{2})(?::\d{2})?$/);
  if (!mt) return null;
  const h = +mt[1], m = +mt[2];
  if (h === 24 && m === 0) return "00:00";
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function parsePlatform(v: string): PlatformCode | "UNSUPPORTED" | null {
  const k = v.trim().toLowerCase().replace(/\s+/g, "");
  if (!k) return null;
  if (k === "shopee") return "SHOPEE";
  if (k === "tiktok" || k === "tiktokshop") return "TIKTOK";
  return "UNSUPPORTED";
}

const STATUS_MAP: Record<string, ScheduleStatus> = {
  "": "SCHEDULED", scheduled: "SCHEDULED", "ตามกำหนด": "SCHEDULED", planned: "SCHEDULED",
  live: "LIVE", "กำลังไลฟ์": "LIVE", done: "DONE", completed: "DONE", "เสร็จแล้ว": "DONE",
  cancelled: "CANCELLED", canceled: "CANCELLED", "ยกเลิก": "CANCELLED",
};

/* ---------- Validate ---------- */
export interface RowError { row: number; field: string; message: string }
export interface ValidationResult {
  rows: Schedule[];
  errors: RowError[];
  warnings: RowError[];
  totalRows: number;
}

export function inScope(s: Pick<Schedule, "date" | "platform" | "shopId">, scope: ImportScope): boolean {
  return s.date.startsWith(scope.month) && s.platform === scope.platform && (scope.shopId === "ALL" || s.shopId === scope.shopId);
}

export function validateRows(
  text: string,
  ctx: { shops: Shop[]; members: Member[]; scope: ImportScope; source: string; importRef: string; now: string },
): ValidationResult {
  const errors: RowError[] = [];
  const warnings: RowError[] = [];
  const out: Schedule[] = [];
  const table = parseCSV(text);
  if (table.length === 0) return { rows: [], errors: [{ row: 0, field: "file", message: "ไฟล์ว่าง ไม่มีข้อมูล" }], warnings, totalRows: 0 };

  const idx = mapHeader(table[0]);
  for (const need of ["date", "start", "end", "platform"]) {
    if (idx[need] === undefined) errors.push({ row: 1, field: need, message: `ไม่พบคอลัมน์ "${need}" ในหัวตาราง` });
  }
  if (idx.shop === undefined && idx.shopId === undefined) errors.push({ row: 1, field: "shop", message: 'ไม่พบคอลัมน์ "shop_name" หรือ "shop_id"' });
  if (idx.host === undefined && idx.hostId === undefined) errors.push({ row: 1, field: "host", message: 'ไม่พบคอลัมน์ "host_name" หรือ "host_id"' });
  if (errors.length) return { rows: [], errors, warnings, totalRows: table.length - 1 };

  const hosts = ctx.members.filter((m) => m.isHost);
  const seen = new Map<string, number>();
  const get = (r: string[], k: string) => (idx[k] === undefined ? "" : (r[idx[k]] ?? "").trim());

  table.slice(1).forEach((r, i) => {
    const rowNo = i + 2; // แถวในชีต (หัวตาราง = 1)
    const before = errors.length;
    const err = (field: string, message: string) => errors.push({ row: rowNo, field, message });

    const date = parseDate(get(r, "date"));
    if (!date) err("date", `วันที่ไม่ถูกต้อง "${get(r, "date")}" (ใช้ YYYY-MM-DD หรือ DD/MM/YYYY)`);
    const start = parseTime(get(r, "start"));
    if (!start) err("start_time", `เวลาเริ่มไม่ถูกต้อง "${get(r, "start")}"`);
    const end = parseTime(get(r, "end"));
    if (!end) err("end_time", `เวลาสิ้นสุดไม่ถูกต้อง "${get(r, "end")}"`);
    if (start && end) {
      if (start === end) err("end_time", "เวลาเริ่มและเวลาสิ้นสุดเท่ากัน");
      else {
        const dur = (toMinutes(end) - toMinutes(start) + 1440) % 1440;
        if (dur > 12 * 60) err("end_time", `ช่วงเวลายาวเกิน 12 ชั่วโมง (${start}–${end})`);
      }
    }

    const p = parsePlatform(get(r, "platform"));
    if (p === null) err("platform", "ไม่ได้ระบุ Platform");
    else if (p === "UNSUPPORTED") err("platform", `ไม่รองรับ Platform "${get(r, "platform")}" (รองรับเฉพาะ Shopee / TikTok)`);
    else if (p !== ctx.scope.platform) err("platform", `Platform "${get(r, "platform")}" อยู่นอก Scope ที่เลือก`);

    if (date && !date.startsWith(ctx.scope.month)) err("date", `วันที่ ${date} อยู่นอกเดือนที่เลือก (${ctx.scope.month})`);

    let shop: Shop | undefined;
    if (p && p !== "UNSUPPORTED") {
      const sid = get(r, "shopId"), sname = get(r, "shop").toLowerCase();
      shop = ctx.shops.find((s) => s.platform === p && (sid ? s.id === sid : s.name.trim().toLowerCase() === sname));
      if (!shop) err("shop", `ไม่พบร้าน "${sid || get(r, "shop")}" ใน ${p === "SHOPEE" ? "Shopee" : "TikTok"} — เพิ่มร้านที่หน้า "จัดการร้านค้า" ก่อน`);
      else if (ctx.scope.shopId !== "ALL" && shop.id !== ctx.scope.shopId) err("shop", `ร้าน "${shop.name}" อยู่นอก Scope ที่เลือก`);
      else if (!shop.active) warnings.push({ row: rowNo, field: "shop", message: `ร้าน "${shop.name}" ถูกปิดใช้งานอยู่` });
    }

    const hid = get(r, "hostId"), hname = get(r, "host").toLowerCase();
    const host = hosts.find((h) => (hid ? h.id === hid : h.name.toLowerCase() === hname || h.nickname.toLowerCase() === hname));
    if (!host) err("host", `ไม่พบ Host "${hid || get(r, "host")}" — เพิ่มที่หน้า "จัดการพนักงาน" ก่อน`);

    const st = STATUS_MAP[get(r, "status").toLowerCase()];
    if (!st) err("status", `สถานะไม่ถูกต้อง "${get(r, "status")}"`);

    if (errors.length > before || !date || !start || !end || !shop || !host || !st || p === null || p === "UNSUPPORTED") return;

    const base = { platform: p, shopId: shop.id, hostId: host.id, date, startTime: start, endTime: end };
    const key = scheduleKey(base);
    if (seen.has(key)) { err("row", `ข้อมูลซ้ำกับแถวที่ ${seen.get(key)}`); return; }
    seen.set(key, rowNo);

    out.push({
      ...base,
      id: scheduleId(base),
      shopName: shop.name,
      hostName: host.name,
      status: st,
      source: ctx.source,
      importRef: ctx.importRef,
      updatedAt: ctx.now,
    });
  });

  // Conflict ภายในไฟล์เป็นคำเตือน (ระบบแจ้งเตือน ไม่บล็อกการนำเข้า)
  const c = detectConflicts(out);
  for (const [a, b] of c.pairs) {
    const A = out.find((s) => s.id === a)!, B = out.find((s) => s.id === b)!;
    warnings.push({ row: 0, field: "conflict", message: `เวลาซ้อนกัน: ${A.date} ${A.startTime}–${A.endTime} ${A.shopName} (${A.hostName}) กับ ${B.startTime}–${B.endTime} ${B.shopName} (${B.hostName})` });
  }

  return { rows: out, errors, warnings, totalRows: table.length - 1 };
}

/* ---------- Diff & Replace ---------- */
export interface Diff { added: Schedule[]; removed: Schedule[]; unchanged: Schedule[]; changed: Schedule[] }

export function diffScope(existing: Schedule[], incoming: Schedule[], scope: ImportScope): Diff {
  const cur = new Map(existing.filter((s) => inScope(s, scope)).map((s) => [s.id, s]));
  const added: Schedule[] = [], unchanged: Schedule[] = [], changed: Schedule[] = [];
  for (const s of incoming) {
    const old = cur.get(s.id);
    if (!old) added.push(s);
    else if (old.status !== s.status) changed.push(s);
    else unchanged.push(s);
    cur.delete(s.id);
  }
  return { added, removed: [...cur.values()], unchanged, changed };
}

/** แทนที่เฉพาะข้อมูลใน Scope — ข้อมูล Platform/Shop/เดือนอื่นคงเดิมทุกแถว */
export function replaceScope(all: Schedule[], incoming: Schedule[], scope: ImportScope): { next: Schedule[]; backup: Schedule[] } {
  const backup: Schedule[] = [];
  const keep: Schedule[] = [];
  for (const s of all) (inScope(s, scope) ? backup : keep).push(s);
  const prev = new Map(backup.map((s) => [s.id, s]));
  // รายการที่ไม่เปลี่ยนคง updatedAt เดิม
  const merged = incoming.map((s) => {
    const o = prev.get(s.id);
    return o && o.status === s.status ? { ...s, updatedAt: o.updatedAt } : s;
  });
  return { next: [...keep, ...merged], backup };
}

/** แยก CSV ตามเดือน (ใช้กับ Auto Sync ที่ชีตมีหลายเดือน) — คืน CSV ต่อเดือนพร้อมหัวตาราง */
export function splitByMonth(text: string): { months: Map<string, string>; badRows: number[] } {
  const table = parseCSV(text);
  const months = new Map<string, string[][]>();
  const badRows: number[] = [];
  if (!table.length) return { months: new Map(), badRows };
  const idx = mapHeader(table[0]);
  table.slice(1).forEach((r, i) => {
    const d = idx.date === undefined ? null : parseDate(r[idx.date] ?? "");
    if (!d) { badRows.push(i + 2); return; }
    const m = d.slice(0, 7);
    (months.get(m) ?? months.set(m, []).get(m)!).push(r);
  });
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const toCsv = (rows: string[][]) => rows.map((r) => r.map(esc).join(",")).join("\n");
  return { months: new Map([...months].map(([m, rows]) => [m, toCsv([table[0], ...rows])])), badRows };
}
