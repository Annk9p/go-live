// อ่านชีตแบบ "ตาราง" ของทีม: 1 แท็บ = 1 เดือน + 1 Platform (เช่น "Shopee 12/2026", "Tiktok 12/2026")
// ในแท็บมีหลายบล็อก บล็อกละ 1 ร้าน: แถวหัว (ชื่อร้าน / วันในสัปดาห์) → แถววันที่ 01..31 → แถวช่วงเวลา "HH:mm - HH:mm"
// แต่ละช่อง = ชื่อ Host · ช่วงเวลาที่ติดกันของ Host เดียวกันในร้าน/วันเดียวกัน รวมเป็นไลฟ์เดียว
// ใช้ได้ทั้งฝั่ง Node (สคริปต์ Sync บน GitHub Actions) และเบราว์เซอร์
import type { PlatformCode } from "./types.ts";

export interface TabInfo { platform: PlatformCode; month: string } // month = YYYY-MM
export interface MatrixSlot { shopName: string; date: string; startTime: string; endTime: string; host: string }
export interface MatrixIssue { row: number; message: string }
export interface MatrixResult {
  tab: TabInfo;
  slots: MatrixSlot[];
  shops: string[]; // ชื่อร้านตามที่เขียนในชีต (เรียงตามลำดับบล็อก)
  errors: MatrixIssue[];
  warnings: MatrixIssue[];
}

const TIME_RANGE = /^(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})$/;
const WEEKDAYS = new Set(["mon", "tue", "wed", "thu", "fri", "sat", "sun", "จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"]);
const IGNORE_LABELS = new Set(["date_time", "date", "time", "campaign", "วันที่", "เวลา"]);

const clean = (v: string | undefined) => (v ?? "").replace(/\s+/g, " ").trim();
const pad = (n: number) => String(n).padStart(2, "0");

/** อ่าน Platform + เดือนจากชื่อแท็บ เช่น "Shopee 12/2026", "TikTok 1/2027" — ไม่ตรงรูปแบบ = null (ข้ามแท็บนี้) */
export function parseTabName(name: string): TabInfo | null {
  const n = name.toLowerCase();
  const platform: PlatformCode | null = n.includes("shopee") ? "SHOPEE" : n.includes("tiktok") || n.includes("tik tok") ? "TIKTOK" : null;
  const m = name.match(/(\d{1,2})\s*[/\-.]\s*(\d{4})/);
  if (!platform || !m) return null;
  let year = Number(m[2]);
  if (year > 2400) year -= 543; // ปี พ.ศ.
  const month = Number(m[1]);
  if (month < 1 || month > 12) return null;
  return { platform, month: `${year}-${pad(month)}` };
}

function daysIn(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** แถววันที่: มีเลข 1..31 เรียงต่อกันอย่างน้อย 7 ช่อง → คืน map คอลัมน์ → วันที่ */
function dayColumns(row: string[]): Map<number, number> | null {
  const cols = new Map<number, number>();
  let prev = 0;
  for (let c = 0; c < row.length; c++) {
    const v = clean(row[c]);
    if (!/^\d{1,2}$/.test(v)) continue;
    const d = Number(v);
    if (d === prev + 1 || (prev === 0 && d === 1)) { cols.set(c, d); prev = d; }
  }
  return cols.size >= 7 ? cols : null;
}

function shopLabel(rows: string[][], r: number, dayCols: Map<number, number>): string | null {
  const firstDayCol = Math.min(...dayCols.keys());
  for (const rr of [r, r - 1]) {
    const row = rows[rr];
    if (!row) continue;
    for (let c = 0; c < Math.min(row.length, firstDayCol); c++) {
      const v = clean(row[c]);
      if (!v || /^\d+$/.test(v) || TIME_RANGE.test(v) || IGNORE_LABELS.has(v.toLowerCase()) || WEEKDAYS.has(v.toLowerCase())) continue;
      return v;
    }
  }
  return null;
}

export function parseMatrixTab(rows: string[][], tabName: string): MatrixResult | null {
  const tab = parseTabName(tabName);
  if (!tab) return null;
  const maxDay = daysIn(tab.month);
  const result: MatrixResult = { tab, slots: [], shops: [], errors: [], warnings: [] };
  let block: { shop: string | null; days: Map<number, number>; headerRow: number } | null = null;

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const timeCol = row.findIndex((v) => TIME_RANGE.test(clean(v)));
    if (timeCol === -1) {
      const days = dayColumns(row);
      if (days) {
        const shop = shopLabel(rows, r, days);
        block = { shop, days, headerRow: r };
        if (!shop) result.errors.push({ row: r + 1, message: "พบแถววันที่แต่ไม่พบชื่อร้านของบล็อกนี้" });
        else if (!result.shops.includes(shop)) result.shops.push(shop);
        for (const d of days.values()) if (d > maxDay) result.errors.push({ row: r + 1, message: `วันที่ ${d} เกินจำนวนวันของเดือน ${tab.month}` });
      }
      continue;
    }
    const hasHost = row.some((v, c) => c !== timeCol && clean(v) && !/^\d+$/.test(clean(v)));
    if (!block) { if (hasHost) result.errors.push({ row: r + 1, message: "มีแถวเวลาก่อนหัวตาราง (ไม่รู้ว่าเป็นร้าน/วันไหน)" }); continue; }
    if (!block.shop) continue;
    const m = clean(row[timeCol]).match(TIME_RANGE)!;
    const sh = Number(m[1]), sm = Number(m[2]), eh = Number(m[3]), em = Number(m[4]);
    if (sh > 23 || sm > 59 || eh > 24 || em > 59) { result.errors.push({ row: r + 1, message: `ช่วงเวลาไม่ถูกต้อง: ${clean(row[timeCol])}` }); continue; }
    const startTime = `${pad(sh)}:${pad(sm)}`;
    const endTime = eh === 24 ? "00:00" : `${pad(eh)}:${pad(em)}`;
    if (startTime === endTime) { result.errors.push({ row: r + 1, message: `เวลาเริ่มเท่ากับเวลาจบ: ${clean(row[timeCol])}` }); continue; }
    for (const [c, d] of block.days) {
      if (c <= timeCol) continue;
      const host = clean(row[c]);
      if (!host || d > maxDay) continue;
      result.slots.push({ shopName: block.shop, date: `${tab.month}-${pad(d)}`, startTime, endTime, host: host.toUpperCase() });
    }
  }
  if (!result.shops.length) result.warnings.push({ row: 0, message: "ไม่พบบล็อกร้านในแท็บนี้" });
  return result;
}

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** รวมช่วงเวลาที่ต่อกันของ Host เดียวกัน (ร้าน + วันเดียวกัน) เป็นไลฟ์เดียว เช่น 14–15 + 15–16 → 14:00–16:00 */
export function mergeSlots(slots: MatrixSlot[]): MatrixSlot[] {
  const groups = new Map<string, MatrixSlot[]>();
  for (const s of slots) {
    const k = `${s.shopName}|${s.date}|${s.host}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(s);
  }
  const out: MatrixSlot[] = [];
  for (const list of groups.values()) {
    list.sort((a, b) => toMin(a.startTime) - toMin(b.startTime));
    const merged: MatrixSlot[] = [];
    for (const s of list) {
      const last = merged[merged.length - 1];
      if (last && last.endTime !== "00:00" && last.endTime === s.startTime) last.endTime = s.endTime;
      else merged.push({ ...s });
    }
    out.push(...merged);
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || toMin(a.startTime) - toMin(b.startTime) || a.shopName.localeCompare(b.shopName));
}
