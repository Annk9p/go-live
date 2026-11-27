import Link from "next/link";
export default function NotFound() {
  return (
    <div className="ox-empty">
      <div className="ox-empty__title">ไม่พบหน้านี้</div>
      <Link className="ox-btn ox-btn--secondary" href="/schedule/me">กลับไปตารางไลฟ์ของฉัน</Link>
    </div>
  );
}
