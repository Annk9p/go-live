import type { Metadata, Viewport } from "next";
import { AppShell } from "@/components/AppShell";
import "./omnix-ds.css";
import "./app.css";

// ฟอนต์โหลดจาก Google Fonts ในเบราว์เซอร์ (ไม่ดาวน์โหลดตอน build — next/font ทำให้ build บน GitHub ล้มเหลวเป็นครั้งคราว)
const FONTS = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Sans+Thai:wght@400;500;600&family=Noto+Sans+Thai:wght@400;500;600&display=swap";

export const metadata: Metadata = { title: "GO LIVE", description: "GO LIVE — ระบบจัดการตารางไลฟ์ Shopee / TikTok ของทีม", applicationName: "GO LIVE" };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href={FONTS} />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
