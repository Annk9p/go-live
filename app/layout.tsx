import type { Metadata, Viewport } from "next";
import { Inter, IBM_Plex_Sans_Thai, Noto_Sans_Thai } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import "./omnix-ds.css";
import "./app.css";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-inter", display: "swap" });
const plex = IBM_Plex_Sans_Thai({ subsets: ["thai", "latin"], weight: ["400", "500", "600"], variable: "--font-plex-thai", display: "swap" });
const noto = Noto_Sans_Thai({ subsets: ["thai"], weight: ["400", "500", "600"], variable: "--font-noto-thai", display: "swap" });

export const metadata: Metadata = { title: "LIVE SCHEDULE", description: "ระบบจัดการตารางไลฟ์ Shopee / TikTok" };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${inter.variable} ${plex.variable} ${noto.variable}`} suppressHydrationWarning>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
