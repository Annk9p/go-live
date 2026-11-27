"use client";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { addMonths, fmtHours, fmtMonthName, todayBangkok } from "@/lib/time";
import { monthStats } from "@/lib/stats";
import { platformByCode, type PlatformCode } from "@/lib/types";
import { BarH, ChartCard, Kpi, LineSeries, fmtH, fmtN, pct, useTokens } from "@/components/charts";
import { Avatar, EmptyState, PageHead } from "@/components/ui";

export default function MySummaryPage() {
  const { db, me, isAdmin, shopsById } = useStore();
  const [hostId, setHostId] = useState(me.isHost ? me.id : db.members.find((m) => m.isHost)?.id ?? me.id);
  const subjectId = isAdmin ? hostId : me.id; // Employee ดูได้เฉพาะของตัวเอง
  const subject = db.members.find((m) => m.id === subjectId) ?? me;
  const [month, setMonth] = useState(todayBangkok().slice(0, 7));
  const t = useTokens();

  const mine = useMemo(() => db.schedules.filter((s) => s.hostId === subjectId), [db.schedules, subjectId]);
  const cur = useMemo(() => monthStats(mine, month), [mine, month]);
  const prev = useMemo(() => monthStats(mine, addMonths(month, -1)), [mine, month]);
  const doneRate = (s: typeof cur) => (s.count + s.cancelled ? (s.count / (s.count + s.cancelled)) * 100 : null);

  const daily = cur.byDay.map((m, i) => ({ label: String(i + 1), hours: +(m / 60).toFixed(2) }));
  const byShop = [...cur.byShop.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.minutes - a.minutes);
  const pfColor = (p: PlatformCode) => (t ? (p === "SHOPEE" ? t["--pf-shopee"] : t["--pf-tiktok"]) : undefined);

  return (
    <>
      <PageHead title="สรุปผลงานของฉัน" desc={<span className="ox-row"><Avatar member={subject} />{subject.name} · {fmtMonthName(month)}</span>} />
      <div className="ox-filter-bar" role="group" aria-label="ตัวกรอง">
        {isAdmin && (
          <label className="ls-filter-field"><span className="ox-label">Host</span>
            <select className="ox-control" value={hostId} onChange={(e) => setHostId(e.target.value)}>
              {db.members.filter((m) => m.isHost).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
        )}
        <label className="ls-filter-field"><span className="ox-label">เดือน</span>
          <input type="month" className="ox-control" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        </label>
        <span className="ox-filter-bar__spacer" />
        <span className="ox-filter-bar__meta">นับเฉพาะรายการที่ไม่ถูกยกเลิก · เวลา Asia/Bangkok</span>
      </div>

      {!subject.isHost ? <EmptyState title="บัญชีนี้ไม่ได้เป็น Host">สรุปผลงานแสดงเฉพาะพนักงานที่เป็น Host</EmptyState> : (
        <>
          <div className="ox-kpi-grid">
            <Kpi label="ชั่วโมงไลฟ์" value={fmtH(cur.minutes / 60)} delta={pct(cur.minutes, prev.minutes)} />
            <Kpi label="จำนวนไลฟ์" value={fmtN.format(cur.count)} delta={pct(cur.count, prev.count)} />
            <Kpi label="ไลฟ์เสร็จแล้ว" value={fmtN.format(cur.done)} note={`จาก ${fmtN.format(cur.count)} รายการ`} />
            <Kpi label="อัตรายกเลิก" value={doneRate(cur) === null ? "—" : `${(100 - doneRate(cur)!).toFixed(1)}%`} note={`${cur.cancelled} รายการ`} />
          </div>
          <ChartCard wide title="ชั่วโมงไลฟ์รายวัน" sub={fmtMonthName(month)} empty={cur.minutes ? null : `ไม่มีข้อมูลใน ${fmtMonthName(month)}`}>
            <LineSeries data={daily} series={[{ key: "hours", name: "ชั่วโมง", color: t?.["--omnix-chart-1"] ?? "" }]} fmt={fmtH} />
          </ChartCard>
          <div className="ox-chart-grid">
            <ChartCard title="ชั่วโมงตาม Platform" empty={cur.minutes ? null : "ไม่มีข้อมูล"}>
              <BarH data={[...cur.byPlatform.entries()].map(([p, m]) => ({ name: platformByCode(p as PlatformCode).name, value: +(m / 60).toFixed(1), color: pfColor(p as PlatformCode) }))} fmt={fmtH} />
            </ChartCard>
            <ChartCard title="ชั่วโมงตามร้าน" sub="เรียงจากมากไปน้อย" empty={cur.minutes ? null : "ไม่มีข้อมูล"}>
              <BarH data={byShop.slice(0, 8).map((s) => ({ name: (() => { const x = shopsById.get(s.id); return x ? `${x.name} · ${x.platform === "SHOPEE" ? "Shopee" : "TikTok"}` : s.id; })(), value: +(s.minutes / 60).toFixed(1) }))} fmt={fmtH} />
            </ChartCard>
          </div>
          <div className="ox-table-wrap">
            <table className="ox-table ox-table--data">
              <thead><tr><th>ร้าน</th><th>Platform</th><th className="is-num">จำนวนไลฟ์</th><th className="is-num">ชั่วโมง</th><th>สัดส่วน</th></tr></thead>
              <tbody>
                {byShop.map((s) => {
                  const shop = shopsById.get(s.id);
                  const p = cur.minutes ? (s.minutes / cur.minutes) * 100 : 0;
                  return (
                    <tr key={s.id}>
                      <td>{shop?.name ?? s.id}</td><td>{shop ? platformByCode(shop.platform).name : "—"}</td>
                      <td className="is-num">{fmtN.format(s.count)}</td><td className="is-num">{fmtH(s.minutes / 60)}</td>
                      <td><span className="ox-bar" style={{ width: Math.max(2, p * 1.4) }} /> <span className="ox-num ox-xs">{p.toFixed(1)}%</span></td>
                    </tr>
                  );
                })}
                {byShop.length === 0 && <tr><td colSpan={5} className="ox-muted">ไม่มีข้อมูลในเดือนนี้</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
