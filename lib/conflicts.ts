// ตรวจสอบเวลาซ้อนทับระดับ Global — ทุก Host / Shop / Platform
// เงื่อนไข: start_A < end_B && end_A > start_B  (ชนขอบพอดี เช่น 10:00 จบ / 10:00 เริ่ม = ไม่ Conflict)
// อัลกอริทึม sweep line: O(n log n + k) รองรับข้อมูลจำนวนมาก
import type { Schedule } from "./types.ts";
import { absInterval } from "./time.ts";

export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export interface ConflictResult {
  pairs: Array<[string, string]>;
  byId: Map<string, string[]>;
}

type Item = { id: string; start: number; end: number };

export function detectConflicts(list: Pick<Schedule, "id" | "date" | "startTime" | "endTime" | "status">[]): ConflictResult {
  const items: Item[] = [];
  for (const s of list) {
    if (s.status === "CANCELLED") continue; // รายการที่ยกเลิกไม่นับ
    const [start, end] = absInterval(s);
    items.push({ id: s.id, start, end });
  }
  items.sort((a, b) => a.start - b.start || a.end - b.end);

  const pairs: Array<[string, string]> = [];
  const byId = new Map<string, string[]>();
  let active: Item[] = [];
  for (const cur of items) {
    active = active.filter((a) => a.end > cur.start);
    for (const a of active) {
      if (!overlaps(a.start, a.end, cur.start, cur.end)) continue;
      pairs.push([a.id, cur.id]);
      (byId.get(a.id) ?? byId.set(a.id, []).get(a.id)!).push(cur.id);
      (byId.get(cur.id) ?? byId.set(cur.id, []).get(cur.id)!).push(a.id);
    }
    active.push(cur);
  }
  return { pairs, byId };
}
