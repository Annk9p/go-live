"use client";
// สิทธิ์การมองเห็นข้อมูล: Admin เห็นทั้งหมด · Employee เห็นทั้งทีม หรือเฉพาะร้านที่ตัวเองไลฟ์ (ตั้งค่าได้)
import { useMemo } from "react";
import { useStore } from "./store";
import type { PlatformCode } from "./types";

export function useVisibility() {
  const { db, me, isAdmin } = useStore();
  return useMemo(() => {
    const restricted = !isAdmin && db.settings.employeeTeamView === "OWN_SHOPS";
    const ownShops = new Set(db.schedules.filter((s) => s.hostId === me.id).map((s) => s.shopId));
    const schedules = restricted ? db.schedules.filter((s) => ownShops.has(s.shopId)) : db.schedules;
    const shops = db.shops
      .filter((s) => (isAdmin ? true : s.active) && (!restricted || ownShops.has(s.id)))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    const shopsOf = (p: PlatformCode) => shops.filter((s) => s.platform === p);
    return { restricted, schedules, shops, shopsOf };
  }, [db.schedules, db.shops, db.settings.employeeTeamView, me.id, isAdmin]);
}
