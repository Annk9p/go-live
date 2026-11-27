import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCSV } from "../lib/import.ts";
import { mergeSlots, parseMatrixTab, parseTabName } from "../lib/sheet-matrix.ts";
import { buildPublished } from "../lib/published.ts";

// ตัวอย่างย่อจากรูปแบบชีตจริง: บล็อก Shopee แบบมีแถววันในสัปดาห์ + บล็อก Campaign ที่ชื่อร้านอยู่แถววันที่ + ช่วง 2 ชม.
const SHOPEE = [
  ",ELOOPTH,,Tue,Wed,Thu,Fri,Sat,Sun,Mon",
  ",,,01,02,03,04,05,06,07",
  ",,08:00 - 09:00,TANGMO,,,,,,",
  ",,09:00 - 10:00,TANGMO, FRING,,,,,",
  ",,10:00 - 11:00,AON, FRING,,,,,",
  ",,23:00 - 0:00,LEAD,,,,,,",
  ",Campaign\t\t,,Tue,Wed,Thu,Fri,Sat,Sun,Mon",
  ",ELOOPPB,,01,02,03,04,05,06,07",
  ",,20:00 - 22:00,,LEAD,,,,,",
].join("\n");
const TIKTOK = ["ELOOPTH, ,Tue,Wed,Thu,Fri,Sat,Sun,Mon", ",Date_Time,01,02,03,04,05,06,07", ",22:00 - 23:00,KUKKIK,,,,,,", ",23:00 - 00:00,KUKKIK,,,,,,"].join("\n");

test("sheet: ชื่อแท็บ → Platform + เดือน", () => {
  assert.deepEqual(parseTabName("Shopee 12/2026"), { platform: "SHOPEE", month: "2026-12" });
  assert.deepEqual(parseTabName("Tiktok 1/2570"), { platform: "TIKTOK", month: "2027-01" });
  assert.equal(parseTabName("สรุป"), null);
  assert.equal(parseTabName("Lazada 12/2026"), null);
});

test("sheet: อ่านหลายบล็อก + รวมช่วงเวลาติดกัน + ข้ามเที่ยงคืน", () => {
  const r = parseMatrixTab(parseCSV(SHOPEE), "Shopee 12/2026")!;
  assert.deepEqual(r.shops, ["ELOOPTH", "ELOOPPB"]);
  assert.equal(r.errors.length, 0);
  const m = mergeSlots(r.slots);
  const key = (s: (typeof m)[number]) => `${s.shopName} ${s.date} ${s.startTime}-${s.endTime} ${s.host}`;
  assert.deepEqual(m.map(key), [
    "ELOOPTH 2026-12-01 08:00-10:00 TANGMO",
    "ELOOPTH 2026-12-01 10:00-11:00 AON",
    "ELOOPTH 2026-12-01 23:00-00:00 LEAD",
    "ELOOPTH 2026-12-02 09:00-11:00 FRING", // " FRING" มีช่องว่างนำหน้าในชีต
    "ELOOPPB 2026-12-02 20:00-22:00 LEAD",
  ]);
});

test("sheet: TikTok ที่หัวคอลัมน์ต่างตำแหน่ง + 23:00-00:00 รวมกับ 22:00-23:00", () => {
  const r = parseMatrixTab(parseCSV(TIKTOK), "Tiktok 12/2026")!;
  assert.deepEqual(mergeSlots(r.slots).map((s) => `${s.startTime}-${s.endTime} ${s.host}`), ["22:00-00:00 KUKKIK"]);
});

test("sheet: แท็บที่ผิด → ไม่แทนที่ คงข้อมูลเดิมของเดือน + Platform นั้น", () => {
  const good = parseMatrixTab(parseCSV(SHOPEE), "Shopee 12/2026")!;
  const first = buildPublished([{ name: "Shopee 12/2026", result: good }], { title: "t", url: "u", now: "2026-11-27T00:00:00Z" });
  assert.equal(first.tabs[0].status, "OK");
  assert.equal(first.schedules.length, 5);
  assert.ok(first.shops.some((s) => s.id === "shp_shopee_elooppb" && s.name === "EloopPB"));
  // วันที่ 31 ในเดือนที่มี 30 วัน → error
  const bad = parseMatrixTab(parseCSV(SHOPEE.replace("01,02,03,04,05,06,07", "25,26,27,28,29,30,31")), "Shopee 11/2026")!;
  assert.ok(bad.errors.length > 0);
  const badDec = { ...good, errors: [{ row: 3, message: "x" }] };
  const second = buildPublished([{ name: "Shopee 12/2026", result: badDec }], { title: "t", url: "u", now: "2026-11-27T01:00:00Z", previous: first });
  assert.equal(second.tabs[0].status, "ERROR_KEPT");
  assert.deepEqual(second.schedules.map((s) => s.id), first.schedules.map((s) => s.id));
  assert.equal(second.members.length, first.members.length);
});

test("sheet: สี Host ไม่ซ้ำกัน และคงที่", () => {
  const r = parseMatrixTab(parseCSV(SHOPEE), "Shopee 12/2026")!;
  const a = buildPublished([{ name: "S", result: r }], { title: "t", url: "u", now: "x" });
  const b = buildPublished([{ name: "S", result: r }], { title: "t", url: "u", now: "y" });
  assert.equal(new Set(a.members.map((m) => m.color)).size, a.members.length);
  assert.deepEqual(a.members.map((m) => m.color), b.members.map((m) => m.color));
  assert.equal(a.hash, b.hash);
});
