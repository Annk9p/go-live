"use client";
import { Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { ScheduleBoard } from "@/components/ScheduleBoard";
import { PageHead } from "@/components/ui";
import { useVisibility } from "@/lib/visibility";

function TeamBoard() {
  const { shops, restricted } = useVisibility();
  const q = useSearchParams();
  const host = q.get("host") ?? undefined, date = q.get("date") ?? undefined, open = q.get("open") ?? undefined;
  const base = useCallback(() => true, []);
  return (
    <>
      <PageHead title="ตารางไลฟ์ทีม" desc={restricted ? "แสดงตารางของทีมเฉพาะร้านที่คุณมีตารางไลฟ์ (ตามสิทธิ์ที่ผู้ดูแลกำหนด)" : "ตารางของทุกคน ทุก Platform และทุก Shop"} />
      <ScheduleBoard key={`${host}-${date}-${open}`} pageKey="team" base={base} shopOptions={shops} initialHost={host} initialDate={date} initialOpen={open} show={{ platform: true, shop: true, host: true }} />
    </>
  );
}

export default function TeamSchedulePage() {
  return <Suspense fallback={<div className="ox-skeleton" style={{ height: 400 }} />}><TeamBoard /></Suspense>;
}
