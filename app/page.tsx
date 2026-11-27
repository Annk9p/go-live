"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// หน้าแรก → ตารางไลฟ์ของฉัน (ทำฝั่งเบราว์เซอร์ เพื่อให้ใช้กับเว็บแบบไฟล์ล้วนบน GitHub Pages ได้)
export default function Home() {
  const router = useRouter();
  useEffect(() => { router.replace("/schedule/me"); }, [router]);
  return <div className="ox-skeleton" style={{ height: 320 }} aria-label="กำลังเปิดตารางไลฟ์ของฉัน" />;
}
