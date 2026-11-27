"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { addMonths, absInterval, fmtD, fmtHours, fmtMonthName, fmtTs, todayBangkok, nowBangkokMinutes, dayIndex } from "@/lib/time";
import { monthStats } from "@/lib/stats";
import { AdminOnly } from "@/components/AdminOnly";
import { BarH, ChartCard, Kpi, LineSeries, fmtH, fmtN, pct, useTokens } from "@/components/charts";
import { EventModal } from "@/components/ScheduleBoard";
import { PageHead, PlatformBadge } from "@/components/ui";

export default function DashboardPage() {
  return <AdminOnly><Dashboard /></AdminOnly>;
}

function Dashboard() {
  const { db, conflicts, schedulesById, shopsById, membersById } = useStore();
  const t = useTokens();
  const today = todayBangkok();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [open, setOpen] = useState<string | null>(null);

  const cur = useMemo(() => monthStats(db.schedules, month), [db.schedules, month]);
  const prev = useMemo(() => monthStats(db.schedules, addMonths(month, -1)), [db.schedules, month]);
  const todayCount = db.schedules.filter((s) => s.date === today && s.status !== "CANCELLED").length;

  // Conflict ที่ยังไม่ถึงเวลา (ต้องแก้ก่อนไลฟ์)
  const nowAbs = dayIndex(today) * 1440 + nowBangkokMinutes();
  const upcomingConflicts = useMemo(() => conflicts.pairs
    .map(([a, b]) => [schedulesById.get(a)!, schedulesById.get(b)!] as const)
    .filter(([a, b]) => a && b && Math.max(absInterval(a)[1], absInterval(b)[1]) > nowAbs)
    .sort((x, y) => absInterval(x[0])[0] - absInterval(y[0])[0]), [conflicts, schedulesById, nowAbs]);

  const dailyData = useMemo(() => {
    const rows = db.schedules.filter((s) => s.date.startsWith(month) && s.status !== "CANCELLED");
    const days = cur.byDay.length;
    const out = Array.from({ length: days }, (_, i) => ({ label: String(i + 1), SHOPEE: 0, TIKTOK: 0 }));
    for (const s of rows) { const [a, b] = absInterval(s); out[Number(s.date.slice(8)) - 1][s.platform] += (b - a) / 60; }
    return out.map((d) => ({ ...d, SHOPEE: +d.SHOPEE.toFixed(1), TIKTOK: +d.TIKTOK.toFixed(1) }));
  }, [db.schedules, month, cur.byDay.length]);

  const lastImport = db.imports[0];
  const shopee = db.shops.filter((s) => s.platform === "SHOPEE" && s.active).length;
  const tiktok = db.shops.filter((s) => s.platform === "TIKTOK" && s.active).length;
  const activeHosts = cur.byHost.size;
  const totalHosts = db.members.filter((m) => m.isHost && m.active).length;

  return (
    <>
      <PageHead title="ภาพรวมระบบ" desc="สรุปตารางไลฟ์ Conflict และสถานะการนำเข้าข้อมูล">
        <Link className="ox-btn ox-btn--secondary" href="/admin/import">นำเข้าข้อมูล</Link>
      </PageHead>
      <div className="ox-filter-bar">
        <label className="ls-filter-field"><span className="ox-label">เดือน</span><input type="month" className="ox-control" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} /></label>
        <span className="ox-filter-bar__spacer" />
        <span className="ox-filter-bar__meta">{db.published
          ? <>ซิงก์จาก Google Sheets ล่าสุด {fmtTs(db.published.generatedAt)} · อัตโนมัติทุก 30 นาที</>
          : <>นำเข้าล่าสุด {fmtTs(lastImport?.createdAt)} · Auto Sync {db.settings.autoSyncEnabled ? `เปิด (ทุก ${db.settings.autoSyncIntervalMin} นาที)` : "ปิด"}</>}</span>
      </div>

      <div className="ox-kpi-grid ls-kpi-5">
        <Kpi label="ไลฟ์ทั้งหมด" value={fmtN.format(cur.count)} delta={pct(cur.count, prev.count)} note={`วันนี้ ${fmtN.format(todayCount)} ไลฟ์`} />
        <Kpi label="ชั่วโมงไลฟ์รวม" value={fmtH(cur.minutes / 60)} delta={pct(cur.minutes, prev.minutes)} />
        <Kpi label="Host ที่มีไลฟ์" value={fmtN.format(activeHosts)} note={`จาก Host ทั้งหมด ${fmtN.format(totalHosts)} คน`} />
        <Kpi label="ร้านค้าที่ใช้งาน" value={fmtN.format(shopee + tiktok)} note={`Shopee ${shopee} · TikTok ${tiktok}`} />
        <Kpi label="Conflict ที่ยังไม่ถึงเวลา" value={fmtN.format(upcomingConflicts.length)} note={upcomingConflicts.length ? "ต้องแก้ในชีตต้นทาง" : "ไม่มี"} tone={upcomingConflicts.length ? "danger" : undefined} />
      </div>

      <ChartCard wide title="ชั่วโมงไลฟ์รายวันตาม Platform" sub={fmtMonthName(month)} legend={t ? [["Shopee", t["--pf-shopee"]], ["TikTok", t["--pf-tiktok"]]] : undefined} empty={cur.minutes ? null : `ไม่มีข้อมูลใน ${fmtMonthName(month)}`}>
        <LineSeries data={dailyData} series={[{ key: "SHOPEE", name: "Shopee", color: t?.["--pf-shopee"] ?? "" }, { key: "TIKTOK", name: "TikTok", color: t?.["--pf-tiktok"] ?? "" }]} fmt={fmtH} />
      </ChartCard>

      <div className="ox-chart-grid">
        <ChartCard title="ชั่วโมงตาม Host" sub="เรียงจากมากไปน้อย" empty={cur.minutes ? null : "ไม่มีข้อมูล"}>
          <BarH data={[...cur.byHost.entries()].sort((a, b) => b[1].minutes - a[1].minutes).slice(0, 8).map(([id, v]) => ({ name: membersById.get(id)?.name ?? id, value: +(v.minutes / 60).toFixed(1), color: membersById.get(id)?.color }))} fmt={fmtH} />
        </ChartCard>
        <ChartCard title="ชั่วโมงตามร้าน" sub="8 อันดับแรก" empty={cur.minutes ? null : "ไม่มีข้อมูล"}>
          <BarH data={[...cur.byShop.entries()].sort((a, b) => b[1].minutes - a[1].minutes).slice(0, 8).map(([id, v]) => { const s = shopsById.get(id); return { name: s ? `${s.name} · ${s.platform === "SHOPEE" ? "Shopee" : "TikTok"}` : id, value: +(v.minutes / 60).toFixed(1), color: t ? (s?.platform === "SHOPEE" ? t["--pf-shopee"] : t["--pf-tiktok"]) : undefined }; })} fmt={fmtH} />
        </ChartCard>
      </div>

      <div className="ox-card">
        <div className="ox-card__body" style={{ paddingBottom: 0 }}><div className="ox-section-title"><h2>Conflict ที่ยังไม่ถึงเวลา</h2><span className="ox-xs ox-muted">Host คนเดียวกันซ้อนเวลา (ข้ามร้าน/Platform) หรือร้านเดียวกันมีไลฟ์ซ้อน</span></div></div>
        <div className="ox-table-wrap" style={{ border: 0, borderTop: "1px solid var(--omnix-border)", borderRadius: "0 0 8px 8px" }}>
          <table className="ox-table ox-table--data">
            <thead><tr><th>วันที่</th><th>รายการ A</th><th>รายการ B</th></tr></thead>
            <tbody>
              {upcomingConflicts.slice(0, 30).map(([a, b]) => (
                <tr key={a.id + b.id}>
                  <td className="ox-num">{fmtD(a.date)}</td>
                  {[a, b].map((s) => (
                    <td key={s.id}><a href="#" onClick={(e) => { e.preventDefault(); setOpen(s.id); }} className="ox-row" style={{ gap: 6 }}><span className="ox-num">{s.startTime}–{s.endTime}</span><PlatformBadge platform={s.platform} />{shopsById.get(s.shopId)?.name} · {membersById.get(s.hostId)?.nickname}</a></td>
                  ))}
                </tr>
              ))}
              {upcomingConflicts.length === 0 && <tr><td colSpan={3} className="ox-muted">ไม่มี Conflict ที่ยังไม่ถึงเวลา</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {open && <EventModal id={open} onClose={() => setOpen(null)} onOpen={setOpen} />}
    </>
  );
}
