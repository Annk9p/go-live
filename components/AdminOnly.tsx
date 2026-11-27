"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { useStore } from "@/lib/store";
import { EmptyState } from "./ui";

/** หน้าจัดการระบบ — Employee เข้าไม่ได้ (Phase 2+ ต้องตรวจซ้ำฝั่ง API) */
export function AdminOnly({ children }: { children: ReactNode }) {
  const { isAdmin } = useStore();
  if (!isAdmin)
    return (
      <EmptyState title="ไม่มีสิทธิ์เข้าถึงหน้านี้" action={<Link className="ox-btn ox-btn--secondary" href="/schedule/me">ไปที่ตารางไลฟ์ของฉัน</Link>}>
        หน้านี้สำหรับผู้ดูแลระบบเท่านั้น
      </EmptyState>
    );
  return <>{children}</>;
}
