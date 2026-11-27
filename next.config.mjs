/** @type {import('next').NextConfig} */
// STATIC_EXPORT=1 → สร้างเป็นไฟล์ล้วน (โฟลเดอร์ out/) สำหรับ GitHub Pages · NEXT_BASE_PATH = /ชื่อ-repo
// NEXT_DIST_DIR ใช้ตอน build ทดสอบขณะ dev server รันอยู่ (ไม่ให้ทับโฟลเดอร์ .next ของ dev)
const isStatic = process.env.STATIC_EXPORT === "1";
const nextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  env: { NEXT_PUBLIC_STATIC_EXPORT: isStatic ? "1" : "0" },
  ...(isStatic ? { output: "export", basePath: process.env.NEXT_BASE_PATH || "", images: { unoptimized: true } } : {}),
};
export default nextConfig;
