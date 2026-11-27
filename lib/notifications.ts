"use client";
// การแจ้งเตือนในแถบบน — คำนวณจากข้อมูลจริงในระบบ (ไม่มีรายการปลอม)
// Host: ไลฟ์ถัดไปของตัวเอง · ทุกคน: Conflict ที่ยังไม่ถึงเวลา (Employee เห็นเฉพาะที่เกี่ยวกับตัวเอง) · Admin: ผลการนำเข้า / Auto Sync
import { useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "./store";
import { useVisibility } from "./visibility";
import { absInterval, addDays, dayIndex, fmtD, nowBangkokMinutes, todayBangkok } from "./time";
import { storage } from "./storage";

export type NotiTone = "info" | "danger" | "warning" | "success";
export interface Noti { id: string; tone: NotiTone; title: string; detail: string; at: string; href: string }

const pfName = (p: string) => (p === "SHOPEE" ? "Shopee" : "TikTok");

export function useNotifications() {
  const { db, me, isAdmin, conflicts, schedulesById, shopsById, membersById } = useStore();
  const { schedules } = useVisibility();
  const [tick, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick((t) => t + 1), 60_000); return () => clearInterval(id); }, []);

  const items = useMemo<Noti[]>(() => {
    void tick;
    const today = todayBangkok();
    const nowAbs = dayIndex(today) * 1440 + nowBangkokMinutes();
    const horizon = dayIndex(addDays(today, 7)) * 1440;
    const out: Noti[] = [];
    const shopName = (id: string, fallback: string) => shopsById.get(id)?.name ?? fallback;

    if (me.isHost) {
      const next = schedules
        .filter((s) => s.hostId === me.id && s.status !== "CANCELLED" && absInterval(s)[1] > nowAbs)
        .sort((a, b) => absInterval(a)[0] - absInterval(b)[0])[0];
      if (next) {
        const live = absInterval(next)[0] <= nowAbs;
        out.push({
          id: `next:${next.id}`, tone: live ? "success" : "info",
          title: live ? "คุณกำลังไลฟ์อยู่ตอนนี้" : "ไลฟ์ถัดไปของคุณ",
          detail: `${next.date === today ? "วันนี้" : fmtD(next.date)} ${next.startTime}–${next.endTime} · ${pfName(next.platform)} · ${shopName(next.shopId, next.shopName)}`,
          at: `${next.date}T${next.startTime}`, href: `/schedule/me?date=${next.date}&open=${next.id}`,
        });
      }
    }

    const pairs = conflicts.pairs
      .map(([a, b]) => [schedulesById.get(a), schedulesById.get(b)] as const)
      .filter((x): x is readonly [NonNullable<typeof x[0]>, NonNullable<typeof x[1]>] => !!x[0] && !!x[1])
      .filter(([a, b]) => Math.max(absInterval(a)[1], absInterval(b)[1]) > nowAbs && Math.min(absInterval(a)[0], absInterval(b)[0]) < horizon)
      .filter(([a, b]) => isAdmin || a.hostId === me.id || b.hostId === me.id)
      .sort((x, y) => absInterval(x[0])[0] - absInterval(y[0])[0]);
    for (const [a, b] of pairs.slice(0, 6)) {
      const who = (s: typeof a) => membersById.get(s.hostId)?.nickname || s.hostName;
      out.push({
        id: `conflict:${a.id}|${b.id}`, tone: "danger", title: "เวลาไลฟ์ซ้อนทับ",
        detail: `${fmtD(a.date)} ${a.startTime}–${a.endTime} ${pfName(a.platform)} ${shopName(a.shopId, a.shopName)} (${who(a)}) ซ้อนกับ ${b.startTime}–${b.endTime} ${pfName(b.platform)} ${shopName(b.shopId, b.shopName)} (${who(b)})`,
        at: `${a.date}T${a.startTime}`, href: `/schedule/team?date=${a.date}&open=${a.id}`,
      });
    }
    if (pairs.length > 6) {
      out.push({ id: `conflict-more:${pairs.length}`, tone: "danger", title: `Conflict อีก ${pairs.length - 6} คู่ใน 7 วันข้างหน้า`, detail: "ดูรายการทั้งหมดที่หน้าภาพรวมระบบ", at: "", href: isAdmin ? "/admin/dashboard" : "/schedule/team" });
    }

    if (isAdmin) {
      const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
      for (const b of db.imports.filter((x) => x.createdAt >= weekAgo).slice(0, 5)) {
        if (b.status === "SKIPPED_NO_CHANGE") continue;
        const scope = `${b.scope.month} · ${pfName(b.scope.platform)} · ${b.scope.shopId === "ALL" ? "ทุกร้าน" : shopName(b.scope.shopId, b.scope.shopId)}`;
        out.push(b.status === "REJECTED"
          ? { id: `import:${b.id}`, tone: "danger", title: "นำเข้าไม่สำเร็จ — ข้อมูลเดิมไม่ถูกแทนที่", detail: `${b.sourceName} · ${scope} · ${b.errorCount} ข้อผิดพลาด`, at: b.createdAt, href: "/admin/import?tab=errors" }
          : { id: `import:${b.id}:${b.status}`, tone: b.status === "ROLLED_BACK" ? "warning" : "success", title: b.status === "ROLLED_BACK" ? "ย้อนกลับการนำเข้าแล้ว" : "นำเข้าข้อมูลสำเร็จ", detail: `${b.sourceName} · ${scope} · +${b.added} −${b.removed}`, at: b.createdAt, href: "/admin/import?tab=history" });
      }
      for (const src of db.sources.filter((s) => s.enabled && s.lastStatus && /ล้มเหลว|ไม่ผ่าน/.test(s.lastStatus))) {
        out.push({ id: `sync:${src.id}:${src.lastSyncedAt}`, tone: "warning", title: "Auto Sync มีปัญหา", detail: `${src.name} · ${src.lastStatus}`, at: src.lastSyncedAt ?? "", href: "/admin/import?tab=sync" });
      }
    }
    return out;
  }, [tick, db.imports, db.sources, me, isAdmin, schedules, conflicts, schedulesById, shopsById, membersById]);

  const key = `live-schedule:noti-seen:${me.id}`;
  const [seen, setSeen] = useState<string[]>([]);
  useEffect(() => { setSeen(storage.get<string[]>(key) ?? []); }, [key]);
  const unread = items.filter((n) => !seen.includes(n.id)).length;
  const markAll = useCallback(() => { const ids = items.map((n) => n.id); storage.set(key, ids); setSeen(ids); }, [items, key]);
  const markOne = useCallback((id: string) => { setSeen((prev) => { const next = prev.includes(id) ? prev : [...prev, id].slice(-200); storage.set(key, next); return next; }); }, [key]);
  return { items, unread, seen, markAll, markOne };
}
