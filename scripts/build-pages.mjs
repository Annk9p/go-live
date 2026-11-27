// Build เว็บแบบไฟล์ล้วนสำหรับ GitHub Pages → out/
// GitHub Pages ไม่มีเซิร์ฟเวอร์ จึงพัก app/api (proxy Google Sheets) ไว้ระหว่าง build แล้วคืนที่เดิมเสมอ
import { existsSync, renameSync } from "node:fs";
import { spawnSync } from "node:child_process";

const api = "app/api", parked = ".api-parked";
if (existsSync(api)) renameSync(api, parked);
let code = 1;
try {
  const r = spawnSync("npx", ["next", "build"], { stdio: "inherit", env: { ...process.env, STATIC_EXPORT: "1" } });
  code = r.status ?? 1;
} finally {
  if (existsSync(parked)) renameSync(parked, api);
}
process.exit(code);
