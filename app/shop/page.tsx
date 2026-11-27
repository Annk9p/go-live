"use client";
import Link from "next/link";
import { Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { useVisibility } from "@/lib/visibility";
import { ScheduleBoard } from "@/components/ScheduleBoard";
import { EmptyState, PageHead, PlatformBadge } from "@/components/ui";
import { platformByCode, type Schedule } from "@/lib/types";

// ร้านเพิ่มได้ตลอด จึงใช้ ?id= แทน path (/shop?id=…) — ใช้กับเว็บแบบไฟล์ล้วนได้โดยไม่ต้องสร้างหน้าใหม่ต่อร้าน
function ShopBoard() {
  const shopId = useSearchParams().get("id") ?? "";
  const { shopsById } = useStore();
  const { shops } = useVisibility();
  const shop = shopsById.get(shopId);
  const base = useCallback((s: Schedule) => s.shopId === shopId, [shopId]);
  if (!shop || !shops.some((s) => s.id === shopId))
    return <EmptyState title="ไม่พบร้านนี้ หรือคุณไม่มีสิทธิ์ดู" action={<Link className="ox-btn ox-btn--secondary" href="/schedule/team">ไปที่ตารางไลฟ์ทีม</Link>} />;
  const p = platformByCode(shop.platform);
  return (
    <>
      <PageHead
        title={<span className="ox-row">{shop.name}<PlatformBadge platform={shop.platform} />{!shop.active && <span className="ox-badge ox-badge--warning">ปิดใช้งาน</span>}</span>}
        desc={<span>ตารางไลฟ์เฉพาะร้าน {shop.name} บน {p.name} · Host ที่ไลฟ์ร้านนี้ทั้งหมด · <Link href={`/platform/${p.slug}`}>ดูตาราง {p.name} รวม</Link></span>}
      />
      <ScheduleBoard key={shop.id} pageKey="shop" base={base} hostScope="page" show={{ host: true }} />
    </>
  );
}

export default function ShopSchedulePage() {
  return <Suspense fallback={<div className="ox-skeleton" style={{ height: 400 }} />}><ShopBoard /></Suspense>;
}
