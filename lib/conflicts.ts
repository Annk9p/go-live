// ตรวจสอบเวลาซ้อนทับ (Conflict)
// กติกาธุรกิจ: คนละร้าน / คนละ Platform ไลฟ์พร้อมกันได้ แต่
//   1) Host คนเดียวกันอยู่สองที่พร้อมกันไม่ได้ (ข้ามร้านและข้าม Platform)  → reason "HOST"
//   2) ร้านเดียวกันมีไลฟ์สองรายการพร้อมกันไม่ได้                           → reason "SHOP"
// เงื่อนไขซ้อน: start_A < end_B && end_A > start_B (ชนขอบพอดี เช่น 10:00 จบ / 10:00 เริ่ม = ไม่ Conflict)
// อัลกอริทึม sweep line แยกตามกลุ่ม (Host / ร้าน): O(n log n + k) รองรับข้อมูลจำนวนมาก
import type { Schedule } from "./types.ts";
import { absInterval } from "./time.ts";

export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export type ConflictReason = "HOST" | "SHOP" | "BOTH";

export interface ConflictResult {
  pairs: Array<[string, string]>;
  byId: Map<string, string[]>;
  /** เหตุผลของแต่ละคู่ — key = conflictKey(a, b) */
  reasons: Map<string, ConflictReason>;
}

export const conflictKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

type Item = { id: string; start: number; end: number };
type Input = Pick<Schedule, "id" | "date" | "startTime" | "endTime" | "status" | "hostId" | "shopId">;

function sweep(items: Item[], found: (a: Item, b: Item) => void) {
  items.sort((a, b) => a.start - b.start || a.end - b.end);
  let active: Item[] = [];
  for (const cur of items) {
    active = active.filter((a) => a.end > cur.start);
    for (const a of active) if (overlaps(a.start, a.end, cur.start, cur.end)) found(a, cur);
    active.push(cur);
  }
}

export function detectConflicts(list: Input[]): ConflictResult {
  const byHost = new Map<string, Item[]>();
  const byShop = new Map<string, Item[]>();
  for (const s of list) {
    if (s.status === "CANCELLED") continue; // รายการที่ยกเลิกไม่นับ
    const [start, end] = absInterval(s);
    const it = { id: s.id, start, end };
    (byHost.get(s.hostId) ?? byHost.set(s.hostId, []).get(s.hostId)!).push(it);
    (byShop.get(s.shopId) ?? byShop.set(s.shopId, []).get(s.shopId)!).push({ ...it });
  }

  const pairs: Array<[string, string]> = [];
  const byId = new Map<string, string[]>();
  const reasons = new Map<string, ConflictReason>();
  const add = (reason: "HOST" | "SHOP") => (a: Item, b: Item) => {
    const k = conflictKey(a.id, b.id);
    const prev = reasons.get(k);
    if (prev) { if (prev !== reason) reasons.set(k, "BOTH"); return; }
    reasons.set(k, reason);
    const [x, y] = a.start <= b.start ? [a.id, b.id] : [b.id, a.id];
    pairs.push([x, y]);
    (byId.get(x) ?? byId.set(x, []).get(x)!).push(y);
    (byId.get(y) ?? byId.set(y, []).get(y)!).push(x);
  };
  for (const items of byHost.values()) sweep(items, add("HOST"));
  for (const items of byShop.values()) sweep(items, add("SHOP"));
  return { pairs, byId, reasons };
}

export const REASON_LABEL: Record<ConflictReason, string> = {
  HOST: "Host คนเดียวกันซ้อนเวลา",
  SHOP: "ร้านเดียวกันมีไลฟ์ซ้อน",
  BOTH: "Host และร้านเดียวกันซ้อนเวลา",
};
