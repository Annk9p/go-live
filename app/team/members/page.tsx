"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useVisibility } from "@/lib/visibility";
import { absInterval, dayIndex, durationMinutes, fmtD, fmtHours, fmtMonthName, nowBangkokMinutes, todayBangkok } from "@/lib/time";
import { Avatar, Button, EmptyState, PageHead, PlatformBadge } from "@/components/ui";
import { Search } from "@/components/icons";
import type { PlatformCode, Schedule } from "@/lib/types";

type RoleF = "ALL" | "HOST" | "ADMIN" | "EMPLOYEE";

export default function TeamMembersPage() {
  const { db, me, isAdmin, shopsById } = useStore();
  const { schedules } = useVisibility();
  const today = todayBangkok();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [q, setQ] = useState("");
  const [role, setRole] = useState<RoleF>("ALL");
  const [pf, setPf] = useState<PlatformCode | "ALL">("ALL");
  const [status, setStatus] = useState<"ACTIVE" | "ALL" | "INACTIVE">(isAdmin ? "ALL" : "ACTIVE");

  // สรุปต่อคน: จำนวนไลฟ์ / ชั่วโมงในเดือนที่เลือก (ไม่นับที่ยกเลิก) + ไลฟ์ถัดไป
  const info = useMemo(() => {
    const nowAbs = dayIndex(today) * 1440 + nowBangkokMinutes();
    const m = new Map<string, { count: number; minutes: number; platforms: Set<PlatformCode>; next?: Schedule }>();
    for (const s of schedules) {
      if (s.status === "CANCELLED") continue;
      const x = m.get(s.hostId) ?? { count: 0, minutes: 0, platforms: new Set<PlatformCode>() };
      if (s.date.startsWith(month)) { x.count++; x.minutes += durationMinutes(s); x.platforms.add(s.platform); }
      if (absInterval(s)[1] > nowAbs && (!x.next || absInterval(s)[0] < absInterval(x.next)[0])) x.next = s;
      m.set(s.hostId, x);
    }
    return m;
  }, [schedules, month, today]);

  const rows = db.members
    .filter((m) => isAdmin || m.active)
    .filter((m) => status === "ALL" || (status === "ACTIVE") === m.active)
    .filter((m) => role === "ALL" || (role === "HOST" ? m.isHost : m.role === role))
    .filter((m) => pf === "ALL" || info.get(m.id)?.platforms.has(pf))
    .filter((m) => { const k = q.trim().toLowerCase(); return !k || m.name.toLowerCase().includes(k) || m.nickname.toLowerCase().includes(k); })
    .sort((a, b) => (info.get(b.id)?.minutes ?? 0) - (info.get(a.id)?.minutes ?? 0) || a.name.localeCompare(b.name, "th"));
  const filtered = q.trim() !== "" || role !== "ALL" || pf !== "ALL" || status !== (isAdmin ? "ALL" : "ACTIVE");
  const totalMin = rows.reduce((a, m) => a + (info.get(m.id)?.minutes ?? 0), 0);

  return (
    <>
      <PageHead title="สมาชิกในทีม" desc={`${db.members.filter((m) => m.isHost && m.active).length} Host ที่ใช้งาน · จำนวนไลฟ์และชั่วโมงของ ${fmtMonthName(month)}`}>
        {isAdmin && <Link className="ox-btn ox-btn--secondary" href="/admin/members">จัดการพนักงาน</Link>}
      </PageHead>

      <div className="ox-filter-bar" role="search">
        <label className="ls-search"><Search size={16} /><input className="ox-control" type="search" placeholder="ค้นหาชื่อหรือชื่อเล่น" value={q} onChange={(e) => setQ(e.target.value)} aria-label="ค้นหาสมาชิก" /></label>
        <label className="ls-filter-field"><span className="ox-label">บทบาท</span>
          <select className="ox-control" value={role} onChange={(e) => setRole(e.target.value as RoleF)}>
            <option value="ALL">ทั้งหมด</option><option value="HOST">Host</option><option value="ADMIN">Admin</option><option value="EMPLOYEE">Employee</option>
          </select>
        </label>
        <label className="ls-filter-field"><span className="ox-label">Platform</span>
          <select className="ox-control" value={pf} onChange={(e) => setPf(e.target.value as PlatformCode | "ALL")}>
            <option value="ALL">ทั้งหมด</option><option value="SHOPEE">ไลฟ์ Shopee</option><option value="TIKTOK">ไลฟ์ TikTok</option>
          </select>
        </label>
        {isAdmin && (
          <label className="ls-filter-field"><span className="ox-label">สถานะ</span>
            <select className="ox-control" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              <option value="ALL">ทั้งหมด</option><option value="ACTIVE">ใช้งาน</option><option value="INACTIVE">ปิดใช้งาน</option>
            </select>
          </label>
        )}
        <label className="ls-filter-field"><span className="ox-label">เดือน</span>
          <input type="month" className="ox-control" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        </label>
        {filtered && <Button variant="ghost" size="sm" onClick={() => { setQ(""); setRole("ALL"); setPf("ALL"); setStatus(isAdmin ? "ALL" : "ACTIVE"); }}>ล้างตัวกรอง</Button>}
        <span className="ox-filter-bar__spacer" />
        <span className="ox-filter-bar__meta ox-num">{rows.length} คน · {fmtHours(totalMin)}</span>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="ไม่พบสมาชิกที่ตรงกับตัวกรอง" action={<Button onClick={() => { setQ(""); setRole("ALL"); setPf("ALL"); }}>ล้างตัวกรอง</Button>} />
      ) : (
        <div className="ox-table-wrap">
          <table className="ox-table ox-table--data ls-member-table">
            <thead>
              <tr><th>พนักงาน</th><th>บทบาท</th><th>สถานะ</th><th className="is-num">จำนวนไลฟ์</th><th className="is-num">ชั่วโมงไลฟ์</th><th className="ls-hide-sm">Platform</th><th className="ls-hide-md">ไลฟ์ถัดไป</th><th style={{ width: 1 }} /></tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const x = info.get(m.id);
                return (
                  <tr key={m.id}>
                    <td>
                      <div className="ox-row" style={{ flexWrap: "nowrap" }}>
                        <Avatar member={m} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 500 }} className="ls-truncate">{m.name}{m.id === me.id && <span className="ox-badge ox-badge--accent" style={{ marginLeft: 6 }}>คุณ</span>}</div>
                          <div className="ox-xs ox-muted">{m.nickname || "—"}</div>
                        </div>
                      </div>
                    </td>
                    <td><span className="ox-row" style={{ gap: 4, flexWrap: "nowrap" }}>{m.role === "ADMIN" ? <span className="ox-badge ox-badge--accent">Admin</span> : <span className="ox-badge">Employee</span>}{m.isHost && <span className="ox-badge" style={{ ["--c" as string]: m.color }}>Host</span>}</span></td>
                    <td>{m.active ? <span className="ox-badge ox-badge--success">ใช้งาน</span> : <span className="ox-badge">ปิดใช้งาน</span>}</td>
                    <td className="is-num">{m.isHost ? (x?.count ?? 0) : "—"}</td>
                    <td className="is-num">{m.isHost ? fmtHours(x?.minutes ?? 0) : "—"}</td>
                    <td className="ls-hide-sm"><span className="ox-row" style={{ gap: 4, flexWrap: "nowrap" }}>{[...(x?.platforms ?? [])].sort().map((p) => <PlatformBadge key={p} platform={p} />)}{!x?.platforms.size && <span className="ox-muted">—</span>}</span></td>
                    <td className="ls-hide-md ox-xs">{x?.next ? <span className="ls-nowrap-cell">{x.next.date === today ? "วันนี้" : fmtD(x.next.date)} {x.next.startTime} · {shopsById.get(x.next.shopId)?.name ?? x.next.shopName}</span> : <span className="ox-muted">—</span>}</td>
                    <td>{m.isHost && <Link className="ox-btn ox-btn--ghost ox-btn--sm" href={`/schedule/team?host=${m.id}`} style={{ whiteSpace: "nowrap" }}>ดูตาราง</Link>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
