// สรุปตัวเลขสำหรับ Dashboard / รายงาน / สรุปผลงาน
import type { Schedule } from "./types";
import { daysInMonth, durationMinutes } from "./time";

export interface MonthStats {
  count: number; minutes: number; done: number; cancelled: number; shops: number;
  byPlatform: Map<string, number>; byShop: Map<string, { count: number; minutes: number }>;
  byHost: Map<string, { count: number; minutes: number }>; byDay: number[];
}

export function monthStats(list: Schedule[], month: string): MonthStats {
  const rows = list.filter((s) => s.date.startsWith(month));
  const st: MonthStats = { count: 0, minutes: 0, done: 0, cancelled: 0, shops: 0, byPlatform: new Map(), byShop: new Map(), byHost: new Map(), byDay: Array(daysInMonth(month)).fill(0) };
  const shops = new Set<string>();
  for (const s of rows) {
    if (s.status === "CANCELLED") { st.cancelled++; continue; }
    const m = durationMinutes(s);
    st.count++; st.minutes += m;
    if (s.status === "DONE") st.done++;
    shops.add(s.shopId);
    st.byPlatform.set(s.platform, (st.byPlatform.get(s.platform) ?? 0) + m);
    const sh = st.byShop.get(s.shopId) ?? { count: 0, minutes: 0 }; sh.count++; sh.minutes += m; st.byShop.set(s.shopId, sh);
    const h = st.byHost.get(s.hostId) ?? { count: 0, minutes: 0 }; h.count++; h.minutes += m; st.byHost.set(s.hostId, h);
    st.byDay[Number(s.date.slice(8)) - 1] += m;
  }
  st.shops = shops.size;
  return st;
}
