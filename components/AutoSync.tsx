"use client";
// ตัวตั้งเวลา Auto Sync (ทุก N นาทีตามตั้งค่า ค่าเริ่มต้น 30) — ตรวจทุก 1 นาทีว่าแหล่งไหนถึงรอบ
// หมายเหตุ Phase 1: ทำงานเฉพาะเมื่อมีคนเปิดเว็บอยู่ · Production ต้องย้ายไป cron ฝั่งเซิร์ฟเวอร์
import { useEffect, useRef } from "react";
import { useStore } from "@/lib/store";
import { runSync } from "@/lib/sync";

export function AutoSync() {
  const store = useStore();
  const ref = useRef(store);
  ref.current = store;
  const running = useRef(false);

  useEffect(() => {
    const tick = async () => {
      const s = ref.current;
      if (running.current || !s.db.settings.autoSyncEnabled) return;
      const due = s.db.sources.filter((src) => src.enabled && (!src.lastSyncedAt || Date.now() - Date.parse(src.lastSyncedAt) >= s.db.settings.autoSyncIntervalMin * 60_000));
      if (!due.length) return;
      running.current = true;
      try {
        for (const src of due) await runSync(ref.current, src, "AUTO");
      } finally {
        running.current = false;
      }
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);
  return null;
}
