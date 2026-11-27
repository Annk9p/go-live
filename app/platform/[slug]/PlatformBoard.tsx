"use client";
import { useCallback } from "react";
import { notFound } from "next/navigation";
import { platformBySlug, type Schedule } from "@/lib/types";
import { useVisibility } from "@/lib/visibility";
import { ScheduleBoard } from "@/components/ScheduleBoard";
import { PageHead, PlatformBadge } from "@/components/ui";

export function PlatformBoard({ slug }: { slug: string }) {
  const p = platformBySlug(slug);
  const { shopsOf } = useVisibility();
  const code = p?.code;
  const base = useCallback((s: Schedule) => s.platform === code, [code]);
  if (!p) notFound();
  const shops = shopsOf(p.code);
  return (
    <>
      <PageHead title={<span className="ox-row">ตาราง {p.name} รวม <PlatformBadge platform={p.code} /></span>} desc={`ตารางไลฟ์ของทุกร้านใน ${p.name} (${shops.length} ร้าน) และทุก Host`} />
      <ScheduleBoard key={p.code} pageKey={`pf-${p.slug}`} base={base} shopOptions={shops} show={{ shop: true, host: true }} />
    </>
  );
}
