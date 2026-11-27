// Sync Google Sheets → public/data/schedule.json (รันบน GitHub Actions ทุก 30 นาที และตอน push)
// 1) อ่านรายชื่อแท็บทั้งหมดจากหน้า htmlview (ชีตต้องแชร์แบบ "ทุกคนที่มีลิงก์ดูได้")
// 2) ดึง CSV ทีละแท็บ → อ่านตาราง (lib/sheet-matrix) → ตรวจสอบ
// 3) แท็บที่ไม่ผ่าน = ไม่แทนที่ คงข้อมูลเดิมของเดือน + Platform นั้น (จากไฟล์ที่เผยแพร่อยู่ = PREV_URL)
// 4) เขียนไฟล์ + บอก GitHub ว่าข้อมูลเปลี่ยนไหม (changed=true/false) เพื่อข้ามการ deploy เมื่อไม่มีอะไรใหม่
// รันในเครื่อง: SHEET_ID=… node scripts/sync-sheet.ts
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { parseCSV } from "../lib/import.ts";
import { parseMatrixTab } from "../lib/sheet-matrix.ts";
import { buildPublished, type PublishedData } from "../lib/published.ts";

const SHEET_ID = process.env.SHEET_ID ?? "";
const PREV_URL = process.env.PREV_URL ?? "";
const OUT = process.env.OUT ?? "public/data/schedule.json";
if (!/^[\w-]{20,}$/.test(SHEET_ID)) throw new Error("ต้องตั้งค่า SHEET_ID (รหัสชีตจากลิงก์ Google Sheets)");
const base = `https://docs.google.com/spreadsheets/d/${SHEET_ID}`;

async function get(url: string) {
  const r = await fetch(url, { redirect: "follow", headers: { "user-agent": "go-live-sync" } });
  if (!r.ok) throw new Error(`HTTP ${r.status} จาก ${url}`);
  return r;
}

function unescapeJs(s: string) {
  return s.replace(/\\x([0-9a-f]{2})/gi, (_m, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\u([0-9a-f]{4})/gi, (_m, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\\//g, "/").replace(/\\"/g, '"');
}

async function listTabs() {
  const html = await (await get(`${base}/htmlview`)).text();
  const title = unescapeJs(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "Google Sheets").replace(/\s+-\s+Google\s+\S+\s*$/, "");
  const tabs = [...html.matchAll(/items\.push\(\{name: "((?:[^"\\]|\\.)*)", pageUrl: "[^"]*", gid: "(\d+)"/g)].map((m) => ({ name: unescapeJs(m[1]), gid: m[2] }));
  if (!tabs.length) throw new Error("อ่านรายชื่อแท็บไม่ได้ — ตรวจว่าชีตแชร์แบบ “ทุกคนที่มีลิงก์ดูได้”");
  return { title, tabs };
}

async function main() {
  const now = new Date().toISOString();
  const { title, tabs } = await listTabs();
  const parsed = [];
  for (const t of tabs) {
    const csv = await (await get(`${base}/export?format=csv&gid=${t.gid}`)).text();
    if (/^\s*<(!doctype|html)/i.test(csv)) throw new Error(`แท็บ "${t.name}" ได้หน้า HTML แทน CSV — ชีตอาจไม่ได้แชร์`);
    parsed.push({ name: t.name, result: parseMatrixTab(parseCSV(csv), t.name) });
  }

  let previous: PublishedData | null = null;
  if (PREV_URL) {
    try { const r = await fetch(PREV_URL, { cache: "no-store" }); if (r.ok) previous = (await r.json()) as PublishedData; } catch { /* รอบแรกยังไม่มีไฟล์เดิม */ }
  }

  const data = buildPublished(parsed, { title, url: `${base}/edit`, now, previous });
  mkdirSync(OUT.replace(/\/[^/]+$/, ""), { recursive: true });
  writeFileSync(OUT, JSON.stringify(data));

  const changed = !previous || previous.hash !== data.hash;
  for (const t of data.tabs) {
    const head = `${t.name}: ${t.status} · ${t.sessions} ไลฟ์ · ร้าน ${t.shops.join(", ") || "—"}`;
    console.log(head);
    // แสดงเป็นคำเตือนในหน้า Actions ของ GitHub
    for (const e of t.errors) console.log(`::warning title=${t.name}::แถว ${e.row}: ${e.message} (ไม่แทนที่ข้อมูลเดือนนี้ คงข้อมูลเดิมไว้)`);
    for (const w of t.warnings) console.log(`::notice title=${t.name}::${w.message}`);
  }
  console.log(`รวม ${data.schedules.length} ไลฟ์ · ${data.members.length} Host · ${data.shops.length} ร้าน · hash ${data.hash} · ${changed ? "มีการเปลี่ยนแปลง" : "ไม่มีการเปลี่ยนแปลง"}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
}

main().catch((e) => { console.error(`::error::Sync ไม่สำเร็จ: ${e instanceof Error ? e.message : e} — ไม่ deploy เว็บยังใช้ข้อมูลเดิม`); process.exit(1); });
