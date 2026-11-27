"use client";
// Sync จาก Google Sheets: ดึง CSV → Hash → (ไม่เปลี่ยน = ข้าม) → Validate ทุกเดือน → ผ่านทั้งหมดจึง Replace ทีละ Scope
// Phase 1 รันในเบราว์เซอร์ขณะเปิดเว็บ · Phase 3 ย้ายไปเป็น cron ฝั่งเซิร์ฟเวอร์ (NestJS @Cron ทุก 30 นาที)
import type { Store } from "./store";
import type { ImportScope, SyncSource } from "./types";
import { contentHash, splitByMonth, validateRows, type RowError } from "./import";
import { toCsvUrl } from "./sheet-url";

export async function fetchSheetCsv(url: string): Promise<string> {
  // เว็บแบบไฟล์ล้วน (GitHub Pages) ไม่มีเซิร์ฟเวอร์ → เบราว์เซอร์ดึงจาก Google ตรง (ชีตต้องแชร์แบบทุกคนที่มีลิงก์ / เผยแพร่เป็น CSV)
  if (process.env.NEXT_PUBLIC_STATIC_EXPORT === "1") {
    const target = toCsvUrl(url);
    let r: Response;
    try { r = await fetch(target, { cache: "no-store" }); }
    catch { throw new Error("ดึงชีตไม่ได้ — ตรวจว่าแชร์แบบ “ทุกคนที่มีลิงก์ดูได้” หรือเผยแพร่เป็น CSV แล้ว (หรือใช้วิธีวาง CSV แทน)"); }
    const text = await r.text();
    if (!r.ok) throw new Error(`Google Sheets ตอบกลับ HTTP ${r.status} — ตรวจสอบว่าเผยแพร่ชีตแล้ว`);
    if ((r.headers.get("content-type") ?? "").includes("text/html")) throw new Error("ได้หน้า HTML แทน CSV — ชีตอาจยังไม่ได้แชร์/เผยแพร่");
    return text;
  }
  const r = await fetch(`/api/sheet?url=${encodeURIComponent(url)}`, { cache: "no-store" });
  const text = await r.text();
  if (!r.ok) throw new Error(text || `ดึงข้อมูลไม่สำเร็จ (HTTP ${r.status})`);
  return text;
}

export type SyncOutcome = { status: "SKIPPED" | "APPLIED" | "REJECTED" | "FAILED"; message: string };

export async function runSync(store: Store, source: SyncSource, trigger: "MANUAL" | "AUTO"): Promise<SyncOutcome> {
  const actor = trigger === "AUTO" ? "system" : undefined;
  const stamp = new Date().toISOString();
  let text: string;
  try {
    text = await fetchSheetCsv(source.csvUrl);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    store.markSource(source.id, { lastSyncedAt: stamp, lastStatus: `ล้มเหลว: ${message}` });
    return { status: "FAILED", message };
  }
  const hash = await contentHash(text);
  const { months, badRows } = splitByMonth(text);
  const scopes: ImportScope[] = [...months.keys()].sort().map((month) => ({ month, platform: source.platform, shopId: source.shopId }));
  const baseScope = scopes[0] ?? { month: stamp.slice(0, 7), platform: source.platform, shopId: source.shopId };

  if (hash === source.lastHash) {
    store.skipImport({ scope: baseScope, hash, trigger, sourceName: source.name, rowCount: 0 }, actor);
    store.markSource(source.id, { lastSyncedAt: stamp, lastStatus: "ไม่มีการเปลี่ยนแปลง (hash เดิม)" });
    return { status: "SKIPPED", message: "ไม่มีการเปลี่ยนแปลง" };
  }

  // Validate ทุกเดือนก่อน — ถ้ามีเดือนใดไม่ผ่าน จะไม่ Replace เลย (ข้อมูลเดิมคงอยู่)
  const errors: RowError[] = badRows.map((row) => ({ row, field: "date", message: "วันที่ไม่ถูกต้อง" }));
  const results = scopes.map((scope) => {
    const importRef = `imp_${hash.slice(0, 8)}_${scope.month.replace("-", "")}`;
    const v = validateRows(months.get(scope.month)!, { shops: store.db.shops, members: store.db.members, scope, source: `${trigger === "AUTO" ? "auto" : "manual"}:${source.id}`, importRef, now: stamp });
    errors.push(...v.errors);
    return { scope, v };
  });
  const rowCount = results.reduce((a, r) => a + r.v.totalRows, 0);

  if (errors.length || results.length === 0) {
    if (!results.length && !errors.length) errors.push({ row: 0, field: "file", message: "ไม่พบข้อมูลในชีต" });
    store.rejectImport({ scope: baseScope, hash, trigger, sourceName: source.name, rowCount, errors }, actor);
    store.markSource(source.id, { lastSyncedAt: stamp, lastStatus: `ไม่ผ่าน Validation (${errors.length} รายการ) — ไม่ได้ Replace` });
    return { status: "REJECTED", message: `ไม่ผ่าน Validation ${errors.length} รายการ` };
  }

  for (const { scope, v } of results) {
    store.applyImport({ scope, rows: v.rows, hash, trigger, sourceName: source.name, rowCount: v.totalRows }, actor);
  }
  store.markSource(source.id, { lastHash: hash, lastSyncedAt: stamp, lastStatus: `นำเข้าแล้ว ${results.length} เดือน` });
  return { status: "APPLIED", message: `นำเข้าแล้ว ${rowCount} แถว (${results.length} เดือน)` };
}
