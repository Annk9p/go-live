// Proxy ดึง CSV จาก Google Sheets ที่เผยแพร่ (เบราว์เซอร์เรียกตรงไม่ได้เพราะ CORS)
// รับเฉพาะ https://docs.google.com/spreadsheets/... เพื่อกัน SSRF
import { NextResponse } from "next/server";
import { toCsvUrl } from "@/lib/sheet-url";

export const dynamic = "force-dynamic";
const MAX_BYTES = 5 * 1024 * 1024;

export async function GET(req: Request) {
  let url: URL;
  try { url = toCsvUrl(new URL(req.url).searchParams.get("url") ?? ""); }
  catch (e) { return new NextResponse(e instanceof Error ? e.message : String(e), { status: 400 }); }

  try {
    const r = await fetch(url, { cache: "no-store", redirect: "follow" });
    if (!r.ok) return new NextResponse(`Google Sheets ตอบกลับ HTTP ${r.status} — ตรวจสอบว่าเผยแพร่ชีตเป็น CSV แล้ว`, { status: 502 });
    const type = r.headers.get("content-type") ?? "";
    const text = await r.text();
    if (text.length > MAX_BYTES) return new NextResponse("ไฟล์ใหญ่เกิน 5 MB", { status: 413 });
    if (type.includes("text/html")) return new NextResponse("ได้หน้า HTML แทน CSV — ชีตอาจยังไม่ได้แชร์/เผยแพร่", { status: 502 });
    return new NextResponse(text, { headers: { "content-type": "text/csv; charset=utf-8", "cache-control": "no-store" } });
  } catch (e) {
    return new NextResponse(`เชื่อมต่อ Google Sheets ไม่ได้: ${e instanceof Error ? e.message : e}`, { status: 502 });
  }
}
