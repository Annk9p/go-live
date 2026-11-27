import { test } from "node:test";
import assert from "node:assert/strict";
import { detectConflicts } from "../lib/conflicts.ts";
import { validateRows, replaceScope, diffScope } from "../lib/import.ts";
import type { Member, Schedule, Shop } from "../lib/types.ts";

const mk = (id: string, s: string, e: string, date = "2026-11-26"): any => ({ id, date, startTime: s, endTime: e, status: "SCHEDULED" });

test("conflict: ชนขอบพอดีไม่นับ", () => {
  assert.equal(detectConflicts([mk("a", "09:00", "10:00"), mk("b", "10:00", "11:00")]).pairs.length, 0);
});
test("conflict: 09–11 กับ 10–12", () => {
  assert.deepEqual(detectConflicts([mk("a", "09:00", "11:00"), mk("b", "10:00", "12:00")]).pairs, [["a", "b"]]);
});
test("conflict: 13–15 กับ 14–16", () => {
  assert.equal(detectConflicts([mk("a", "13:00", "15:00"), mk("b", "14:00", "16:00")]).pairs.length, 1);
});
test("conflict: ข้ามเที่ยงคืน 23:00–01:00 กับ 00:30 วันถัดไป", () => {
  assert.equal(detectConflicts([mk("a", "23:00", "01:00"), mk("b", "00:30", "02:00", "2026-11-27")]).pairs.length, 1);
});
test("conflict: ยกเลิกแล้วไม่นับ", () => {
  assert.equal(detectConflicts([mk("a", "09:00", "11:00"), { ...mk("b", "10:00", "12:00"), status: "CANCELLED" }]).pairs.length, 0);
});
test("conflict: ซ้อน 3 รายการ", () => {
  const r = detectConflicts([mk("a", "09:00", "12:00"), mk("b", "10:00", "11:00"), mk("c", "10:30", "13:00")]);
  assert.equal(r.pairs.length, 3);
});

const shops: Shop[] = [
  { id: "s1", platform: "SHOPEE", name: "Alpha", active: true, sortOrder: 1, createdAt: "" },
  { id: "s2", platform: "SHOPEE", name: "Beta", active: true, sortOrder: 2, createdAt: "" },
  { id: "t1", platform: "TIKTOK", name: "Alpha", active: true, sortOrder: 1, createdAt: "" },
];
const members: Member[] = [{ id: "h1", name: "Mint", nickname: "มิ้นท์", email: "", role: "EMPLOYEE", isHost: true, color: "#000", active: true }];
const ctx = (shopId = "ALL") => ({ shops, members, scope: { month: "2026-12", platform: "SHOPEE" as const, shopId }, source: "test", importRef: "imp", now: "2026-11-26T00:00:00Z" });

test("validate: ผ่าน + รองรับ DD/MM/พ.ศ.", () => {
  const r = validateRows("date,start_time,end_time,platform,shop_name,host_name,status\n01/12/2569,9:00,10.00,Shopee,alpha,มิ้นท์,", ctx());
  assert.equal(r.errors.length, 0);
  assert.equal(r.rows[0].date, "2026-12-01");
  assert.equal(r.rows[0].shopId, "s1");
});
test("validate: Lazada / นอก Scope / ร้านไม่มี / ซ้ำ", () => {
  const csv = [
    "date,start_time,end_time,platform,shop_name,host_name",
    "2026-12-01,09:00,10:00,Lazada,Alpha,Mint",
    "2026-12-01,09:00,10:00,TikTok,Alpha,Mint",
    "2026-11-30,09:00,10:00,Shopee,Alpha,Mint",
    "2026-12-01,09:00,10:00,Shopee,Gamma,Mint",
    "2026-12-02,09:00,10:00,Shopee,Alpha,Mint",
    "2026-12-02,09:00,10:00,Shopee,Alpha,Mint",
  ].join("\n");
  const r = validateRows(csv, ctx());
  assert.deepEqual(r.errors.map((e) => e.row), [2, 3, 4, 5, 7]);
});
test("validate: ร้านนอก Scope เมื่อเลือก shop เดียว", () => {
  const r = validateRows("date,start_time,end_time,platform,shop_name,host_name\n2026-12-01,09:00,10:00,Shopee,Beta,Mint", ctx("s1"));
  assert.equal(r.errors.length, 1);
});
test("replace: ไม่แตะข้อมูลนอก Scope และไม่สร้างซ้ำ", () => {
  const base = (over: Partial<Schedule>): Schedule => ({ id: "x", date: "2026-12-01", startTime: "09:00", endTime: "10:00", platform: "SHOPEE", shopId: "s1", shopName: "", hostId: "h1", hostName: "", status: "SCHEDULED", source: "", importRef: null, updatedAt: "old", ...over });
  const all = [base({ id: "in1" }), base({ id: "out-shop", shopId: "s2" }), base({ id: "out-plat", platform: "TIKTOK", shopId: "t1" }), base({ id: "out-month", date: "2026-11-30" })];
  const scope = { month: "2026-12", platform: "SHOPEE" as const, shopId: "s1" };
  const incoming = [base({ id: "in1", updatedAt: "new" }), base({ id: "in2", startTime: "11:00", endTime: "12:00" })];
  const d = diffScope(all, incoming, scope);
  assert.equal(d.added.length, 1); assert.equal(d.unchanged.length, 1); assert.equal(d.removed.length, 0);
  const { next, backup } = replaceScope(all, incoming, scope);
  assert.deepEqual(backup.map((s) => s.id), ["in1"]);
  assert.deepEqual(next.map((s) => s.id).sort(), ["in1", "in2", "out-month", "out-plat", "out-shop"]);
  assert.equal(next.find((s) => s.id === "in1")!.updatedAt, "old");
  // รันซ้ำด้วยข้อมูลเดิม = ผลเหมือนเดิม (idempotent)
  assert.equal(replaceScope(next, incoming, scope).next.length, next.length);
});

test("ร้านจริง: ชื่อเดียวกันข้าม Platform แยกตาม platform ของแถว", async () => {
  const { realShops } = await import("../lib/mock-data.ts");
  const shops = realShops("2026-11-26T00:00:00Z");
  assert.deepEqual(shops.map((s) => `${s.platform}:${s.name}`), ["SHOPEE:EloopTH", "SHOPEE:MoovTH", "SHOPEE:EloopPB", "TIKTOK:EloopTH", "TIKTOK:MoovTH"]);
  assert.equal(new Set(shops.map((s) => s.id)).size, 5);
  assert.ok(shops.every((s) => !s.isDemo));
  const c = (platform: "SHOPEE" | "TIKTOK") => ({ shops, members, scope: { month: "2026-12", platform, shopId: "ALL" }, source: "t", importRef: "imp", now: "x" });
  const tk = validateRows("date,start_time,end_time,platform,shop_name,host_name\n2026-12-01,09:00,10:00,TikTok,eloopth,Mint", c("TIKTOK"));
  assert.equal(tk.errors.length, 0);
  assert.equal(tk.rows[0].shopId, "shp_tiktok_eloopth");
  const sp = validateRows("date,start_time,end_time,platform,shop_name,host_name\n2026-12-01,09:00,10:00,Shopee,EloopPB,Mint", c("SHOPEE"));
  assert.equal(sp.rows[0].shopId, "shp_shopee_elooppb");
  const bad = validateRows("date,start_time,end_time,platform,shop_name,host_name\n2026-12-01,09:00,10:00,TikTok,EloopPB,Mint", c("TIKTOK"));
  assert.ok(bad.errors.length > 0, "EloopPB ไม่มีใน TikTok ต้องไม่ผ่าน");
});
