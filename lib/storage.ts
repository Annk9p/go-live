// ห่อ localStorage — ห้ามเรียกตรง (undefined บน opaque origin / โยน error ใน Safari private mode)
// Phase 1 ใช้เก็บข้อมูลจำลองในเบราว์เซอร์ · Phase 2+ แทนที่ด้วย API → PostgreSQL
export const storage = {
  get<T>(key: string): T | null {
    try {
      const v = globalThis.localStorage?.getItem(key);
      return v ? (JSON.parse(v) as T) : null;
    } catch { return null; }
  },
  set(key: string, value: unknown): boolean {
    try { globalThis.localStorage?.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
  },
  remove(key: string) {
    try { globalThis.localStorage?.removeItem(key); } catch { /* ignore */ }
  },
};
