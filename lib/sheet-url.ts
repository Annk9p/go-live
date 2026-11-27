// แปลงลิงก์ Google Sheets เป็นลิงก์ CSV + ตรวจว่าเป็น docs.google.com/spreadsheets เท่านั้น (ใช้ทั้งฝั่งเซิร์ฟเวอร์และเบราว์เซอร์)
export function toCsvUrl(raw: string): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("ลิงก์ไม่ถูกต้อง"); }
  if (url.protocol !== "https:" || url.hostname !== "docs.google.com" || !url.pathname.startsWith("/spreadsheets/"))
    throw new Error("รองรับเฉพาะลิงก์ Google Sheets (docs.google.com/spreadsheets)");
  // แปลงลิงก์ /edit เป็น /export?format=csv อัตโนมัติ (ชีตต้องแชร์แบบ "ทุกคนที่มีลิงก์" หรือเผยแพร่ไปยังเว็บ)
  const m = url.pathname.match(/^\/spreadsheets\/d\/([^/]+)\/(edit|view)?/);
  if (m && !url.pathname.includes("/pub") && !url.pathname.includes("/export")) {
    const gid = url.searchParams.get("gid") ?? url.hash.match(/gid=(\d+)/)?.[1] ?? "0";
    url = new URL(`https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`);
  }
  return url;
}
