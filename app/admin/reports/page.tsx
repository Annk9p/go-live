"use client";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { PLATFORMS, type PlatformCode } from "@/lib/types";
import { durationMinutes, fmtMonthName, todayBangkok } from "@/lib/time";
import { AdminOnly } from "@/components/AdminOnly";
import { Button, HostDot, PageHead, PlatformBadge, Segment } from "@/components/ui";
import { Download } from "@/components/icons";
import { fmtH, fmtN } from "@/components/charts";

type Dim = "host" | "shop" | "day";

export default function ReportsPage() {
  return <AdminOnly><Reports /></AdminOnly>;
}

function Reports() {
  const { db, shopsById, membersById } = useStore();
  const [month, setMonth] = useState(todayBangkok().slice(0, 7));
  const [platform, setPlatform] = useState<PlatformCode | "ALL">("ALL");
  const [dim, setDim] = useState<Dim>("host");

  const rows = useMemo(() => db.schedules.filter((s) => s.date.startsWith(month) && (platform === "ALL" || s.platform === platform)), [db.schedules, month, platform]);
  const table = useMemo(() => {
    const m = new Map<string, { key: string; count: number; minutes: number; cancelled: number; shopee: number; tiktok: number }>();
    for (const s of rows) {
      const k = dim === "host" ? s.hostId : dim === "shop" ? s.shopId : s.date;
      const x = m.get(k) ?? { key: k, count: 0, minutes: 0, cancelled: 0, shopee: 0, tiktok: 0 };
      if (s.status === "CANCELLED") x.cancelled++;
      else { const d = durationMinutes(s); x.count++; x.minutes += d; if (s.platform === "SHOPEE") x.shopee += d; else x.tiktok += d; }
      m.set(k, x);
    }
    const list = [...m.values()];
    return dim === "day" ? list.sort((a, b) => a.key.localeCompare(b.key)) : list.sort((a, b) => b.minutes - a.minutes);
  }, [rows, dim]);
  const total = table.reduce((a, r) => a + r.minutes, 0);
  const label = (k: string) => (dim === "host" ? membersById.get(k)?.name ?? k : dim === "shop" ? (() => { const x = shopsById.get(k); return x ? `${x.name} (${x.platform === "SHOPEE" ? "Shopee" : "TikTok"})` : k; })() : k);

  function exportCsv() {
    const head = [dim === "host" ? "host" : dim === "shop" ? "shop" : "date", "lives", "hours", "shopee_hours", "tiktok_hours", "cancelled"].join(",");
    const body = table.map((r) => [`"${label(r.key).replace(/"/g, '""')}"`, r.count, (r.minutes / 60).toFixed(2), (r.shopee / 60).toFixed(2), (r.tiktok / 60).toFixed(2), r.cancelled].join(","));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + [head, ...body].join("\n")], { type: "text/csv;charset=utf-8" }));
    a.download = `report-${dim}-${month}-${platform}.csv`;
    a.click();
  }

  return (
    <>
      <PageHead title="รายงาน" desc={`สรุปชั่วโมงไลฟ์ ${fmtMonthName(month)} แยกตาม Host / ร้าน / วัน`}>
        <Button onClick={exportCsv} disabled={!table.length}><Download size={16} />ดาวน์โหลด CSV</Button>
      </PageHead>
      <div className="ox-filter-bar">
        <label className="ls-filter-field"><span className="ox-label">เดือน</span><input type="month" className="ox-control" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} /></label>
        <label className="ls-filter-field"><span className="ox-label">Platform</span>
          <select className="ox-control" value={platform} onChange={(e) => setPlatform(e.target.value as PlatformCode | "ALL")}>
            <option value="ALL">ทั้งหมด</option>{PLATFORMS.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
          </select>
        </label>
        <Segment<Dim> label="มิติรายงาน" value={dim} onChange={setDim} options={[{ value: "host", label: "ตาม Host" }, { value: "shop", label: "ตามร้าน" }, { value: "day", label: "ตามวัน" }]} />
        <span className="ox-filter-bar__spacer" />
        <span className="ox-filter-bar__meta ox-num">{fmtN.format(rows.length)} รายการ · {fmtH(total / 60)}</span>
      </div>
      <div className="ox-table-wrap">
        <table className="ox-table ox-table--data">
          <thead><tr><th>{dim === "host" ? "Host" : dim === "shop" ? "ร้าน" : "วันที่"}</th><th className="is-num">จำนวนไลฟ์</th><th className="is-num">ชั่วโมงรวม</th><th className="is-num">Shopee</th><th className="is-num">TikTok</th><th className="is-num">ยกเลิก</th><th>สัดส่วน</th></tr></thead>
          <tbody>
            {table.map((r) => {
              const p = total ? (r.minutes / total) * 100 : 0;
              const shop = dim === "shop" ? shopsById.get(r.key) : undefined;
              const host = dim === "host" ? membersById.get(r.key) : undefined;
              return (
                <tr key={r.key}>
                  <td><span className="ox-row" style={{ flexWrap: "nowrap" }}>{host && <HostDot color={host.color} />}{shop && <PlatformBadge platform={shop.platform} />}{shop ? shop.name : label(r.key)}</span></td>
                  <td className="is-num">{fmtN.format(r.count)}</td><td className="is-num">{fmtH(r.minutes / 60)}</td>
                  <td className="is-num">{r.shopee ? fmtH(r.shopee / 60) : "—"}</td><td className="is-num">{r.tiktok ? fmtH(r.tiktok / 60) : "—"}</td>
                  <td className="is-num">{r.cancelled || "—"}</td>
                  <td><span className="ox-bar" style={{ width: Math.max(2, p * 1.4) }} /> <span className="ox-num ox-xs">{p.toFixed(1)}%</span></td>
                </tr>
              );
            })}
            {table.length === 0 && <tr><td colSpan={7} className="ox-muted">ไม่มีข้อมูลใน {fmtMonthName(month)}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
