"use client";
// Store กลางฝั่งหน้าเว็บ (Phase 1) — ทุกหน้าอ่านจากที่เดียว ร้านที่เพิ่มใหม่จึงขึ้นใน Sidebar ทันที
// การแก้ไขทุกชนิดผ่าน action ที่ตรวจสิทธิ์ Admin · Employee เป็น Read-only
// Phase 2+: แทน action เหล่านี้ด้วย API (NestJS) ที่ตรวจสิทธิ์ฝั่งเซิร์ฟเวอร์ซ้ำ
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Db, ImportBatch, ImportError, ImportScope, Member, Schedule, Settings, Shop, SyncSource } from "./types";
import { buildMockDb, DB_VERSION } from "./mock-data";
import { storage } from "./storage";
import { detectConflicts, type ConflictResult } from "./conflicts";
import { diffScope, inScope, replaceScope, type RowError } from "./import";
import type { PublishedData } from "./published";
import { absInterval, dayIndex, nowBangkokMinutes, todayBangkok } from "./time";

const KEY = "live-schedule:db";
const uid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export class PermissionError extends Error {}

interface ImportInput {
  scope: ImportScope;
  rows: Schedule[];
  hash: string;
  trigger: ImportBatch["trigger"];
  sourceName: string;
  rowCount: number;
}

export interface Store {
  db: Db;
  me: Member;
  isAdmin: boolean;
  shopsById: Map<string, Shop>;
  membersById: Map<string, Member>;
  hosts: Member[];
  conflicts: ConflictResult;
  schedulesById: Map<string, Schedule>;
  hasDemo: boolean;
  /* actions */
  switchUser(id: string): void;
  saveShop(shop: Pick<Shop, "platform" | "name"> & Partial<Shop>): Shop;
  deleteShop(id: string): void;
  saveMember(m: Omit<Member, "id"> & { id?: string }): Member;
  applyImport(input: ImportInput, actor?: string): ImportBatch;
  rejectImport(input: Omit<ImportInput, "rows"> & { errors: RowError[] }, actor?: string): ImportBatch;
  skipImport(input: Omit<ImportInput, "rows">, actor?: string): ImportBatch;
  rollback(batchId: string): void;
  saveSource(s: Omit<SyncSource, "id" | "lastHash" | "lastSyncedAt" | "lastStatus"> & Partial<SyncSource>): SyncSource;
  deleteSource(id: string): void;
  markSource(id: string, patch: Partial<SyncSource>): void;
  saveSettings(patch: Partial<Settings>): void;
  clearDemo(): void;
  resetDemo(): void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDbState] = useState<Db | null>(null);
  const ref = useRef<Db | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const saved = storage.get<Db>(KEY);
      const base = saved && saved.version === DB_VERSION ? saved : buildMockDb();
      // ข้อมูลกลางจาก Google Sheets (สร้างโดย GitHub Actions) — ถ้ามี ใช้แทนข้อมูลตัวอย่างทั้งหมด
      const pub = await loadPublished();
      const init = pub ? applyPublished(base, pub) : base;
      if (!alive) return;
      ref.current = init;
      setDbState(init);
      if (pub) storage.set(KEY, init);
    })();
    return () => { alive = false; };
  }, []);

  const commit = useCallback((next: Db) => {
    ref.current = next;
    setDbState(next);
    storage.set(KEY, next);
  }, []);

  const cur = () => ref.current!;
  const actorName = (d: Db) => d.members.find((m) => m.id === d.currentUserId)?.name ?? "unknown";
  const requireAdmin = (d: Db, actor?: string) => {
    if (actor === "system") return "system";
    const me = d.members.find((m) => m.id === d.currentUserId);
    if (me?.role !== "ADMIN") throw new PermissionError("สิทธิ์ไม่เพียงพอ: เฉพาะผู้ดูแลระบบเท่านั้น");
    return me.name;
  };
  const audit = (d: Db, actor: string, action: string, detail: string) =>
    [{ id: uid("aud"), at: new Date().toISOString(), actor, action, detail }, ...d.audit].slice(0, 500);

  const actions = useMemo(() => ({
    switchUser(id: string) {
      const d = cur();
      commit({ ...d, currentUserId: id });
    },
    saveShop(input: Pick<Shop, "platform" | "name"> & Partial<Shop>) {
      const d = cur();
      const actor = requireAdmin(d);
      const name = input.name.trim();
      if (!name) throw new Error("กรุณาระบุชื่อร้าน");
      const dup = d.shops.find((s) => s.platform === input.platform && s.name.toLowerCase() === name.toLowerCase() && s.id !== input.id);
      if (dup) throw new Error(`มีร้าน "${name}" ใน Platform นี้แล้ว`);
      const existing = input.id ? d.shops.find((s) => s.id === input.id) : undefined;
      if (existing && existing.platform !== input.platform && d.schedules.some((s) => s.shopId === existing.id))
        throw new Error("ย้าย Platform ไม่ได้ เพราะร้านนี้มีตารางไลฟ์อยู่แล้ว");
      const shop: Shop = existing
        ? { ...existing, ...input, name }
        : { id: uid("shop"), platform: input.platform, name, active: input.active ?? true, sortOrder: Math.max(-1, ...d.shops.filter((s) => s.platform === input.platform).map((s) => s.sortOrder)) + 1, createdAt: new Date().toISOString() };
      const shops = existing ? d.shops.map((s) => (s.id === shop.id ? shop : s)) : [...d.shops, shop];
      const schedules = existing && existing.name !== name ? d.schedules.map((s) => (s.shopId === shop.id ? { ...s, shopName: name } : s)) : d.schedules;
      commit({ ...d, shops, schedules, audit: audit(d, actor, existing ? "shop.update" : "shop.create", `${shop.platform} · ${name}`) });
      return shop;
    },
    deleteShop(id: string) {
      const d = cur();
      const actor = requireAdmin(d);
      if (d.schedules.some((s) => s.shopId === id)) throw new Error("ลบไม่ได้ เพราะร้านนี้มีตารางไลฟ์ — ใช้ปิดใช้งานแทน");
      const shop = d.shops.find((s) => s.id === id);
      commit({ ...d, shops: d.shops.filter((s) => s.id !== id), audit: audit(d, actor, "shop.delete", shop?.name ?? id) });
    },
    saveMember(input: Omit<Member, "id"> & { id?: string }) {
      const d = cur();
      const actor = requireAdmin(d);
      if (!input.name.trim()) throw new Error("กรุณาระบุชื่อพนักงาน");
      const existing = input.id ? d.members.find((m) => m.id === input.id) : undefined;
      if (existing?.id === d.currentUserId && input.role !== "ADMIN") throw new Error("ไม่สามารถลดสิทธิ์ของบัญชีที่กำลังใช้งานอยู่");
      const m: Member = { ...(existing ?? {}), ...input, id: existing?.id ?? uid("mem"), name: input.name.trim() } as Member;
      const members = existing ? d.members.map((x) => (x.id === m.id ? m : x)) : [...d.members, m];
      const schedules = existing && existing.name !== m.name ? d.schedules.map((s) => (s.hostId === m.id ? { ...s, hostName: m.name } : s)) : d.schedules;
      commit({ ...d, members, schedules, audit: audit(d, actor, existing ? "member.update" : "member.create", m.name) });
      return m;
    },
    applyImport(input: ImportInput, actorIn?: string) {
      const d = cur();
      const actor = requireAdmin(d, actorIn);
      const batchId = uid("imp");
      const rows = input.rows.map((r) => ({ ...r, importRef: batchId })); // ทุกแถวอ้างอิง batch ที่นำเข้า
      const diff = diffScope(d.schedules, rows, input.scope);
      const { next, backup } = replaceScope(d.schedules, rows, input.scope);
      const batch: ImportBatch = {
        id: batchId, createdAt: new Date().toISOString(), trigger: input.trigger, sourceName: input.sourceName,
        scope: input.scope, status: "APPLIED", rowCount: input.rowCount, added: diff.added.length, removed: diff.removed.length,
        unchanged: diff.unchanged.length + diff.changed.length, errorCount: 0, hash: input.hash, actor, backup,
      };
      commit({ ...d, schedules: next, imports: [batch, ...d.imports].slice(0, 100), audit: audit(d, actor, "import.apply", `${batch.id} · ${scopeText(input.scope, d)} · +${batch.added} −${batch.removed}`) });
      return batch;
    },
    rejectImport(input: Omit<ImportInput, "rows"> & { errors: RowError[] }, actorIn?: string) {
      const d = cur();
      const actor = requireAdmin(d, actorIn);
      const batch: ImportBatch = {
        id: uid("imp"), createdAt: new Date().toISOString(), trigger: input.trigger, sourceName: input.sourceName, scope: input.scope,
        status: "REJECTED", rowCount: input.rowCount, added: 0, removed: 0, unchanged: 0, errorCount: input.errors.length, hash: input.hash, actor,
      };
      const errs: ImportError[] = input.errors.map((e) => ({ id: uid("err"), batchId: batch.id, createdAt: batch.createdAt, ...e }));
      commit({ ...d, imports: [batch, ...d.imports].slice(0, 100), importErrors: [...errs, ...d.importErrors].slice(0, 2000), audit: audit(d, actor, "import.reject", `${batch.id} · ${errs.length} errors · ข้อมูลเดิมไม่ถูกแก้ไข`) });
      return batch;
    },
    skipImport(input: Omit<ImportInput, "rows">, actorIn?: string) {
      const d = cur();
      const actor = requireAdmin(d, actorIn);
      const batch: ImportBatch = {
        id: uid("imp"), createdAt: new Date().toISOString(), trigger: input.trigger, sourceName: input.sourceName, scope: input.scope,
        status: "SKIPPED_NO_CHANGE", rowCount: input.rowCount, added: 0, removed: 0, unchanged: 0, errorCount: 0, hash: input.hash, actor,
      };
      commit({ ...d, imports: [batch, ...d.imports].slice(0, 100) });
      return batch;
    },
    rollback(batchId: string) {
      const d = cur();
      const actor = requireAdmin(d);
      const b = d.imports.find((x) => x.id === batchId);
      if (!b || b.status !== "APPLIED" || !b.backup) throw new Error("รายการนี้ Rollback ไม่ได้");
      const later = d.imports.find((x) => x.status === "APPLIED" && x.createdAt > b.createdAt && sameScopeOverlap(x.scope, b.scope));
      if (later) throw new Error(`ต้อง Rollback รายการที่ใหม่กว่า (${later.id}) ใน Scope เดียวกันก่อน`);
      const schedules = [...d.schedules.filter((s) => !inScope(s, b.scope)), ...b.backup];
      const imports = d.imports.map((x) => (x.id === batchId ? { ...x, status: "ROLLED_BACK" as const, rolledBackAt: new Date().toISOString() } : x));
      commit({ ...d, schedules, imports, audit: audit(d, actor, "import.rollback", `${batchId} · ${scopeText(b.scope, d)}`) });
    },
    saveSource(input: Omit<SyncSource, "id" | "lastHash" | "lastSyncedAt" | "lastStatus"> & Partial<SyncSource>) {
      const d = cur();
      const actor = requireAdmin(d);
      if (!/^https:\/\/docs\.google\.com\/spreadsheets\//.test(input.csvUrl)) throw new Error("ลิงก์ต้องเป็น Google Sheets ที่เผยแพร่เป็น CSV (https://docs.google.com/spreadsheets/...)");
      const existing = input.id ? d.sources.find((s) => s.id === input.id) : undefined;
      const s: SyncSource = { lastHash: null, lastSyncedAt: null, lastStatus: null, ...(existing ?? {}), ...input, id: existing?.id ?? uid("src") };
      const sources = existing ? d.sources.map((x) => (x.id === s.id ? s : x)) : [...d.sources, s];
      commit({ ...d, sources, audit: audit(d, actor, existing ? "source.update" : "source.create", s.name) });
      return s;
    },
    deleteSource(id: string) {
      const d = cur();
      const actor = requireAdmin(d);
      commit({ ...d, sources: d.sources.filter((s) => s.id !== id), audit: audit(d, actor, "source.delete", id) });
    },
    markSource(id: string, patch: Partial<SyncSource>) {
      const d = cur();
      commit({ ...d, sources: d.sources.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
    },
    saveSettings(patch: Partial<Settings>) {
      const d = cur();
      const actor = requireAdmin(d);
      commit({ ...d, settings: { ...d.settings, ...patch }, audit: audit(d, actor, "settings.update", JSON.stringify(patch)) });
    },
    clearDemo() {
      const d = cur();
      const actor = requireAdmin(d);
      const me = d.members.find((m) => m.id === d.currentUserId)!;
      // เก็บบัญชีที่กำลังใช้งานไว้ (เป็น Admin) เพื่อไม่ให้ล็อกตัวเองออก
      commit({
        ...d,
        shops: d.shops.filter((s) => !s.isDemo),
        members: d.members.filter((m) => !m.isDemo || m.id === me.id).map((m) => (m.id === me.id ? { ...m, isDemo: false } : m)),
        schedules: d.schedules.filter((s) => !s.isDemo),
        audit: audit(d, actor, "demo.clear", "ล้างข้อมูลตัวอย่างทั้งหมด"),
      });
    },
    resetDemo() {
      const d = cur();
      requireAdmin(d);
      // ไม่ทิ้งร้านจริงที่ Admin เพิ่ม/แก้ไว้ — คงร้านปัจจุบัน แล้วเติมเฉพาะร้านจาก seed ที่ยังไม่มี
      const fresh = buildMockDb();
      const keep = d.shops.filter((s) => !s.isDemo);
      const ids = new Set(keep.map((s) => s.id));
      commit({ ...fresh, shops: [...keep, ...fresh.shops.filter((s) => !ids.has(s.id))] });
    },
  }), [commit]);

  const derived = useMemo(() => {
    if (!db) return null;
    const shopsById = new Map(db.shops.map((s) => [s.id, s]));
    const membersById = new Map(db.members.map((m) => [m.id, m]));
    const me = membersById.get(db.currentUserId) ?? db.members[0];
    return {
      shopsById, membersById, me,
      isAdmin: me?.role === "ADMIN",
      hosts: db.members.filter((m) => m.isHost),
      schedulesById: new Map(db.schedules.map((s) => [s.id, s])),
      conflicts: detectConflicts(db.schedules),
      hasDemo: db.schedules.some((s) => s.isDemo) || db.shops.some((s) => s.isDemo),
    };
  }, [db]);

  if (!db || !derived) return <BootSkeleton />;
  return <Ctx.Provider value={{ db, ...derived, ...actions }}>{children}</Ctx.Provider>;
}

/* ---------- ข้อมูลกลางจาก Google Sheets ---------- */
async function loadPublished(): Promise<PublishedData | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/data/schedule.json`, { cache: "no-store", signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) return null;
    const d = (await r.json()) as PublishedData;
    return d && d.version === 1 && Array.isArray(d.schedules) ? d : null;
  } catch {
    return null;
  }
}

/** รวมข้อมูลกลางเข้ากับข้อมูลในเครื่อง: ตาราง/Host/ร้านมาจากชีต · คงการตั้งค่าที่ Admin แก้ในเครื่อง (สิทธิ์ สี เปิด/ปิด) */
export function applyPublished(d: Db, p: PublishedData): Db {
  const nowAbs = dayIndex(todayBangkok()) * 1440 + nowBangkokMinutes();
  const localMembers = new Map(d.members.filter((m) => !m.isDemo).map((m) => [m.id, m]));
  const admin0 = d.members.find((m) => m.id === "mem_admin");
  const admin: Member = { id: "mem_admin", name: "ผู้ดูแลระบบ", nickname: "Admin", email: "", role: "ADMIN", isHost: false, color: "#5b5bd6", active: true, ...(admin0 && !admin0.isDemo ? admin0 : {}), isDemo: false };
  const hosts = p.members.map((m) => {
    const l = localMembers.get(m.id);
    return l ? { ...m, role: l.role, color: l.color, active: l.active, email: l.email, isDemo: false } : m;
  });
  const extraMembers = d.members.filter((m) => !m.isDemo && m.id !== "mem_admin" && !p.members.some((x) => x.id === m.id));
  const localShops = new Map(d.shops.filter((s) => !s.isDemo).map((s) => [s.id, s]));
  const shops = [
    ...p.shops.map((s) => { const l = localShops.get(s.id); return l ? { ...s, active: l.active, sortOrder: l.sortOrder } : s; }),
    ...d.shops.filter((s) => !s.isDemo && !p.shops.some((x) => x.id === s.id)),
  ];
  // สถานะตามเวลา: ไลฟ์ที่จบแล้ว = เสร็จแล้ว
  const schedules = p.schedules.map((s) => (s.status === "SCHEDULED" && absInterval(s)[1] <= nowAbs ? { ...s, status: "DONE" as const } : s));
  const members = [admin, ...extraMembers, ...hosts];
  return {
    ...d,
    shops,
    members,
    schedules,
    currentUserId: members.some((m) => m.id === d.currentUserId) ? d.currentUserId : "mem_admin",
    published: { generatedAt: p.generatedAt, hash: p.hash, source: p.source, tabs: p.tabs },
  };
}

function sameScopeOverlap(a: ImportScope, b: ImportScope) {
  return a.month === b.month && a.platform === b.platform && (a.shopId === "ALL" || b.shopId === "ALL" || a.shopId === b.shopId);
}

export function scopeText(scope: ImportScope, d: Pick<Db, "shops">) {
  const shop = scope.shopId === "ALL" ? "ทุกร้าน" : d.shops.find((s) => s.id === scope.shopId)?.name ?? scope.shopId;
  return `${scope.month} · ${scope.platform === "SHOPEE" ? "Shopee" : "TikTok"} · ${shop}`;
}

function BootSkeleton() {
  return (
    <div className="ox-app" style={{ padding: 24 }}>
      <div className="ox-skeleton" style={{ height: 52, marginBottom: 16 }} />
      <div className="ox-skeleton" style={{ height: 400 }} />
    </div>
  );
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore ต้องอยู่ใน StoreProvider");
  return s;
}
