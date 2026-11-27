"use client";
// หน้าตารางไลฟ์ (ใช้ร่วมกันทุกหน้า): ตัวกรอง → แจ้งเตือน Conflict → Matrix View / Calendar View (วัน/สัปดาห์/เดือน)
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useStore } from "@/lib/store";
import { useVisibility } from "@/lib/visibility";
import { PLATFORMS, STATUS_LABEL, type Member, type PlatformCode, type Schedule, type Shop } from "@/lib/types";
import {
  addDays, addMonths, daysInMonth, durationMinutes, fmtD, fmtDY, fmtHours, fmtLong, fmtMonthName, fmtTs, fmtWd,
  nowBangkokMinutes, startOfWeek, todayBangkok, toMinutes, absInterval,
} from "@/lib/time";
import { overlaps } from "@/lib/conflicts";
import { storage } from "@/lib/storage";
import { Button, EmptyState, HostDot, Modal, PlatformBadge, Segment } from "./ui";
import { ChevronLeft, ChevronRight, Download, Error as ErrorIcon, Table, Calendar, List, Filter } from "./icons";

type View = "matrix" | "calendar" | "list";
type CalMode = "day" | "week" | "month";

export interface BoardProps {
  pageKey: string;
  base: (s: Schedule) => boolean;
  show: { platform?: boolean; shop?: boolean; host?: boolean };
  shopOptions?: Shop[];
  emptyAction?: ReactNode;
  initialHost?: string;
  /** "all" = แสดงทุก Host ที่ใช้งานอยู่เป็นคอลัมน์ (หน้ารวม) · "page" = เฉพาะ Host ที่มีตารางในหน้านี้ (หน้าร้าน / ของฉัน) */
  hostScope?: "all" | "page";
  initialDate?: string;
  initialOpen?: string;
}

/** จอเล็ก (< 768px) ใช้มุมมองรายการแทนตารางกว้าง */
function useIsMobile() {
  const [m, setM] = useState(false);
  useEffect(() => {
    const q = matchMedia("(max-width: 767px)");
    const f = () => setM(q.matches);
    f(); q.addEventListener("change", f);
    return () => q.removeEventListener("change", f);
  }, []);
  return m;
}

const HOURS = Array.from({ length: 25 }, (_, i) => i);

export function ScheduleBoard({ pageKey, base, show, shopOptions, emptyAction, initialHost, hostScope = "all", initialDate, initialOpen }: BoardProps) {
  const { db, membersById, shopsById, conflicts, schedulesById } = useStore();
  const { schedules } = useVisibility();
  const today = todayBangkok();

  const [view, setView] = useState<View>("matrix");
  const [cal, setCal] = useState<CalMode>("week");
  const [date, setDate] = useState(initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate) ? initialDate : today);
  const [platform, setPlatform] = useState<PlatformCode | "ALL">("ALL");
  const [shop, setShop] = useState<string>("ALL");
  const [host, setHost] = useState<string>(initialHost ?? "ALL");
  const [fromH, setFromH] = useState(0);
  const [toH, setToH] = useState(24);
  const [open, setOpen] = useState<string | null>(initialOpen ?? null);
  const isMobile = useIsMobile();
  const [filtersOpen, setFiltersOpen] = useState(false);
  // จอเล็ก: Matrix (หลายคอลัมน์) แสดงเป็นรายการแทน
  const shown: View = isMobile && view === "matrix" ? "list" : view;

  // จำรูปแบบการแสดงผลของแต่ละหน้า (ไม่จำตัวกรอง — เปิดหน้าใหม่ได้ค่าเริ่มต้นตามสเปกเสมอ)
  useEffect(() => {
    const v = storage.get<{ view: View; cal: CalMode }>(`live-schedule:view:${pageKey}`);
    if (v) { setView(v.view); setCal(v.cal); }
  }, [pageKey]);
  useEffect(() => { storage.set(`live-schedule:view:${pageKey}`, { view, cal }); }, [pageKey, view, cal]);

  /* ---------- กรองข้อมูล ---------- */
  const pageRows = useMemo(() => schedules.filter(base), [schedules, base]);
  const pool = useMemo(() => {
    const allDay = fromH === 0 && toH === 24;
    return pageRows.filter((s) => {
      if (platform !== "ALL" && s.platform !== platform) return false;
      if (shop !== "ALL" && s.shopId !== shop) return false;
      if (host !== "ALL" && s.hostId !== host) return false;
      if (!allDay) {
        const st = toMinutes(s.startTime), en = st + durationMinutes(s);
        if (!overlaps(st, en, fromH * 60, toH * 60)) return false;
      }
      return true;
    });
  }, [pageRows, platform, shop, host, fromH, toH]);

  const byDate = useMemo(() => {
    const m = new Map<string, Schedule[]>();
    for (const s of pool) (m.get(s.date) ?? m.set(s.date, []).get(s.date)!).push(s);
    for (const list of m.values()) list.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return m;
  }, [pool]);

  /* ---------- ช่วงวันที่ของมุมมองปัจจุบัน ---------- */
  const mode: CalMode = shown === "matrix" ? "day" : shown === "list" ? (cal === "month" ? "week" : cal) : cal;
  const range = useMemo(() => {
    if (mode === "day") return { start: date, days: 1 };
    if (mode === "week") return { start: startOfWeek(date), days: 7 };
    const first = `${date.slice(0, 7)}-01`;
    return { start: startOfWeek(first), days: 42 };
  }, [mode, date]);
  const rangeDates = useMemo(() => Array.from({ length: range.days }, (_, i) => addDays(range.start, i)), [range]);
  const inRange = useMemo(() => {
    const month = date.slice(0, 7);
    const dates = mode === "month" ? rangeDates.filter((d) => d.startsWith(month)) : rangeDates;
    return dates.flatMap((d) => byDate.get(d) ?? []);
  }, [rangeDates, byDate, mode, date]);

  const conflictPairs = useMemo(() => {
    const seen = new Set<string>();
    const out: [Schedule, Schedule][] = [];
    for (const s of inRange) {
      for (const oid of conflicts.byId.get(s.id) ?? []) {
        const k = s.id < oid ? `${s.id}|${oid}` : `${oid}|${s.id}`;
        if (seen.has(k)) continue;
        seen.add(k);
        const o = schedulesById.get(oid);
        if (o) out.push(absInterval(s)[0] <= absInterval(o)[0] ? [s, o] : [o, s]);
      }
    }
    return out.sort((a, b) => absInterval(a[0])[0] - absInterval(b[0])[0]);
  }, [inRange, conflicts, schedulesById]);

  const totalMin = inRange.reduce((a, s) => a + (s.status === "CANCELLED" ? 0 : durationMinutes(s)), 0);

  /* ---------- ตัวเลือกในตัวกรอง ---------- */
  const shopChoices = useMemo(() => {
    const list = shopOptions ?? db.shops;
    return list.filter((s) => platform === "ALL" || s.platform === platform);
  }, [shopOptions, db.shops, platform]);
  const hostChoices = useMemo(() => {
    const ids = new Set(pageRows.map((s) => s.hostId));
    return db.members
      .filter((m) => m.isHost && (ids.has(m.id) || (hostScope === "all" && m.active)))
      .sort((a, b) => a.name.localeCompare(b.name, "th"));
  }, [pageRows, db.members, hostScope]);
  // คอลัมน์ของ Matrix: Host = ทั้งหมด → ทุก Host ในขอบเขตหน้า · เลือก Host → คนเดียว
  const matrixHosts = useMemo(() => {
    if (host !== "ALL") { const m = membersById.get(host); return m ? [m] : []; }
    return hostChoices;
  }, [host, hostChoices, membersById]);
  const stats = useMemo(() => {
    const live = inRange.filter((s) => s.status !== "CANCELLED");
    return {
      sessions: live.length,
      hosts: new Set(live.map((s) => s.hostId)).size,
      shops: new Set(live.map((s) => s.shopId)).size,
    };
  }, [inRange]);

  function step(dir: 1 | -1) {
    if (mode === "day") setDate(addDays(date, dir));
    else if (mode === "week") setDate(addDays(date, 7 * dir));
    else setDate(`${addMonths(date.slice(0, 7), dir)}-01`);
  }
  const label = mode === "day" ? fmtLong(date) : mode === "week" ? `${fmtD(range.start)} – ${fmtDY(addDays(range.start, 6))}` : fmtMonthName(date.slice(0, 7));

  const resetFilters = () => { setPlatform("ALL"); setShop("ALL"); setHost("ALL"); setFromH(0); setToH(24); };
  const filtered = platform !== "ALL" || shop !== "ALL" || host !== "ALL" || fromH !== 0 || toH !== 24;
  const activeFilters = [platform !== "ALL", shop !== "ALL", host !== "ALL", fromH !== 0 || toH !== 24].filter(Boolean).length;

  function exportCsv() {
    const head = "schedule_id,date,start_time,end_time,platform,shop_id,shop_name,host_id,host_name,status,source,updated_at";
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const rows = [...inRange].sort((a, b) => absInterval(a)[0] - absInterval(b)[0]).map((s) =>
      [s.id, s.date, s.startTime, s.endTime, s.platform, s.shopId, shopsById.get(s.shopId)?.name ?? s.shopName, s.hostId, membersById.get(s.hostId)?.name ?? s.hostName, s.status, s.source, s.updatedAt].map(esc).join(","));
    const blob = new Blob(["﻿" + [head, ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `live-schedule-${pageKey}-${range.start}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      {/* มือถือ: ย่อตัวกรองไว้หลังปุ่ม เพื่อให้เห็นตารางก่อน */}
      <div className="ls-filter-toggle">
        <Button variant="secondary" size="sm" aria-expanded={filtersOpen} aria-controls={`filters-${pageKey}`} onClick={() => setFiltersOpen(!filtersOpen)}>
          <Filter size={14} />ตัวกรอง{activeFilters ? ` (${activeFilters})` : ""}
        </Button>
        {filtered && <Button variant="ghost" size="sm" onClick={resetFilters}>ล้างตัวกรอง</Button>}
        <span className="ox-xs ox-muted" style={{ marginLeft: "auto" }}>{label}</span>
      </div>
      {/* ตัวกรอง — เปลี่ยนแล้วตารางเปลี่ยนทันที */}
      <div id={`filters-${pageKey}`} className={`ox-filter-bar ls-filter-bar${filtersOpen ? " is-open" : ""}`} role="group" aria-label="ตัวกรอง">
        {show.platform && (
          <label className="ls-filter-field"><span className="ox-label">Platform</span>
            <select className="ox-control" value={platform} onChange={(e) => { setPlatform(e.target.value as PlatformCode | "ALL"); setShop("ALL"); }}>
              <option value="ALL">ทั้งหมด</option>
              {PLATFORMS.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
            </select>
          </label>
        )}
        {show.shop && (
          <label className="ls-filter-field"><span className="ox-label">Shop</span>
            <select className="ox-control" value={shop} onChange={(e) => setShop(e.target.value)}>
              <option value="ALL">ทั้งหมด</option>
              {shopChoices.map((s) => <option key={s.id} value={s.id}>{show.platform && platform === "ALL" ? `${s.platform === "SHOPEE" ? "Shopee" : "TikTok"} · ` : ""}{s.name}</option>)}
            </select>
          </label>
        )}
        {show.host && (
          <label className="ls-filter-field"><span className="ox-label">Host</span>
            <select className="ox-control" value={host} onChange={(e) => setHost(e.target.value)}>
              <option value="ALL">ทั้งหมด</option>
              {hostChoices.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
        )}
        <label className="ls-filter-field"><span className="ox-label">วันที่</span>
          <input type="date" className="ox-control" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} style={{ minWidth: 150 }} />
        </label>
        <span className="ls-filter-field"><span className="ox-label">ช่วงเวลา</span>
          <select className="ox-control" aria-label="ตั้งแต่" value={fromH} onChange={(e) => { const v = +e.target.value; setFromH(v); if (v >= toH) setToH(Math.min(24, v + 1)); }} style={{ minWidth: 90 }}>
            {HOURS.slice(0, 24).map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
          </select>
          <span className="ox-muted">–</span>
          <select className="ox-control" aria-label="ถึง" value={toH} onChange={(e) => { const v = +e.target.value; setToH(v); if (v <= fromH) setFromH(Math.max(0, v - 1)); }} style={{ minWidth: 90 }}>
            {HOURS.slice(1).map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
          </select>
        </span>
        {filtered && <Button variant="ghost" size="sm" onClick={resetFilters}>ล้างตัวกรอง</Button>}
        <span className="ox-filter-bar__spacer" />
        <span className="ox-filter-bar__meta">เวลา Asia/Bangkok</span>
      </div>

      {/* สรุปของช่วงที่แสดง — แยกระดับข้อมูลสรุปออกจากตาราง */}
      <dl className="ls-summary" aria-label="สรุปช่วงที่แสดง">
        <div><dt>ไลฟ์</dt><dd className="ox-num">{stats.sessions.toLocaleString("th-TH")}</dd></div>
        <div><dt>ชั่วโมง</dt><dd className="ox-num">{fmtHours(totalMin)}</dd></div>
        <div><dt>Host</dt><dd className="ox-num">{stats.hosts}</dd></div>
        <div><dt>ร้าน</dt><dd className="ox-num">{stats.shops}</dd></div>
        <div className={conflictPairs.length ? "is-danger" : undefined}><dt>Conflict</dt><dd className="ox-num">{conflictPairs.length}</dd></div>
      </dl>

      {conflictPairs.length > 0 && <ConflictAlert pairs={conflictPairs} onOpen={setOpen} />}

      {/* แถบเครื่องมือ: สลับมุมมอง + เลื่อนวันที่ */}
      <div className="ls-toolbar">
        <Segment<View> label="รูปแบบการแสดงผล" value={shown} onChange={setView} options={[
          ...(isMobile ? [] : [{ value: "matrix" as View, label: <span className="ox-row" style={{ gap: 4 }}><Table size={14} />Matrix</span> }]),
          { value: "calendar", label: <span className="ox-row" style={{ gap: 4 }}><Calendar size={14} />Calendar</span> },
          { value: "list", label: <span className="ox-row" style={{ gap: 4 }}><List size={14} />รายการ</span> },
        ]} />
        {shown === "calendar" && (
          <Segment<CalMode> label="ช่วงปฏิทิน" value={cal} onChange={setCal} options={[
            { value: "day", label: "วัน" }, { value: "week", label: "สัปดาห์" }, { value: "month", label: "เดือน" },
          ]} />
        )}
        {shown === "list" && (
          <Segment<CalMode> label="ช่วงรายการ" value={mode} onChange={setCal} options={[{ value: "day", label: "วัน" }, { value: "week", label: "สัปดาห์" }]} />
        )}
        <span className="ls-date-nav">
          <Button variant="secondary" size="sm" icon aria-label="ก่อนหน้า" onClick={() => step(-1)}><ChevronLeft size={16} /></Button>
          <Button variant="secondary" size="sm" onClick={() => setDate(today)}>วันนี้</Button>
          <Button variant="secondary" size="sm" icon aria-label="ถัดไป" onClick={() => step(1)}><ChevronRight size={16} /></Button>
        </span>
        <span className="ls-date-label">{label}</span>
        {shown === "matrix" && <span className="ox-xs ox-muted ls-hide-md">{matrixHosts.length} Host</span>}
        <span className="ox-filter-bar__spacer" style={{ flex: 1 }} />
        <Button variant="ghost" size="sm" onClick={exportCsv} disabled={!inRange.length}><Download size={14} />ส่งออก CSV</Button>
      </div>

      {pageRows.length === 0 ? (
        <EmptyState title="ยังไม่มีตารางไลฟ์ในหน้านี้" action={emptyAction}>เมื่อผู้ดูแลระบบนำเข้าข้อมูลจาก Google Sheets ตารางจะแสดงที่นี่</EmptyState>
      ) : shown === "matrix" ? (
        <MatrixView date={date} rows={byDate.get(date) ?? []} hosts={membersById} columnsHosts={matrixHosts} fromH={fromH} toH={toH} settings={db.settings} onOpen={setOpen} conflictIds={conflicts.byId} today={today} />
      ) : shown === "list" || (isMobile && mode === "week") ? (
        <AgendaView dates={rangeDates} byDate={byDate} onOpen={setOpen} conflictIds={conflicts.byId} today={today} hosts={membersById}
          emptyText={`ไม่มีรายการไลฟ์${mode === "day" ? "ในวันนี้" : "ในสัปดาห์นี้"}ตามตัวกรองที่เลือก`} />
      ) : mode === "month" ? (
        <MonthView date={date} dates={rangeDates} byDate={byDate} onOpen={setOpen} onDay={(d) => { setDate(d); setCal("day"); }} conflictIds={conflicts.byId} today={today} hosts={membersById} />
      ) : (
        <TimeGrid
          columns={rangeDates.map((d) => ({ key: d, date: d, isToday: d === today, head: <><span>{fmtWd(d)}</span><span className="ox-num">{fmtD(d)}</span><span className="ox-badge ox-num" style={{ marginLeft: "auto" }}>{byDate.get(d)?.length ?? 0}</span></>, events: byDate.get(d) ?? [] }))}
          minCol={mode === "day" ? 280 : 130}
          {...hourRange(rangeDates.flatMap((d) => byDate.get(d) ?? []), fromH, toH, db.settings)}
          onOpen={setOpen} conflictIds={conflicts.byId} hosts={membersById} today={today}
          emptyText={`ไม่มีรายการไลฟ์${mode === "day" ? "ในวันนี้" : "ในสัปดาห์นี้"}ตามตัวกรองที่เลือก`}
        />
      )}

      {open && <EventModal id={open} onClose={() => setOpen(null)} onOpen={setOpen} />}
    </>
  );
}

/* ---------- ช่วงชั่วโมงที่แสดง ---------- */
function hourRange(events: Schedule[], fromH: number, toH: number, settings: { dayStartHour: number; dayEndHour: number }) {
  if (fromH !== 0 || toH !== 24) return { startHour: fromH, endHour: toH };
  let s = settings.dayStartHour, e = settings.dayEndHour;
  for (const ev of events) {
    const st = toMinutes(ev.startTime), en = st + durationMinutes(ev);
    s = Math.min(s, Math.floor(st / 60));
    e = Math.max(e, Math.min(24, Math.ceil(en / 60)));
  }
  return { startHour: s, endHour: e };
}

/* ---------- Matrix: Host = Column, เวลา = Row ---------- */
function MatrixView({ date, rows, hosts, columnsHosts, fromH, toH, settings, onOpen, conflictIds, today }: {
  date: string; rows: Schedule[]; hosts: Map<string, Member>; columnsHosts: Member[]; fromH: number; toH: number;
  settings: { dayStartHour: number; dayEndHour: number }; onOpen: (id: string) => void; conflictIds: Map<string, string[]>; today: string;
}) {
  const columns = useMemo(() => {
    const byHost = new Map<string, Schedule[]>();
    for (const s of rows) (byHost.get(s.hostId) ?? byHost.set(s.hostId, []).get(s.hostId)!).push(s);
    // ทุก Host ในขอบเขตเป็นคอลัมน์ (แม้ไม่มีไลฟ์วันนี้ — เห็นว่าใครว่าง) + Host ที่มีตารางแต่ไม่อยู่ในรายชื่อ (เช่น ถูกปิดใช้งาน)
    const ids = [...columnsHosts.map((m) => m.id)];
    if (columnsHosts.length !== 1) for (const id of byHost.keys()) if (!ids.includes(id)) ids.push(id);
    return ids.map((id) => {
      const m = hosts.get(id);
      const events = byHost.get(id) ?? [];
      const min = events.reduce((a, s) => a + (s.status === "CANCELLED" ? 0 : durationMinutes(s)), 0);
      return {
        key: id, date, isToday: date === today, events,
        head: <><HostDot color={m?.color ?? "var(--omnix-fg-muted)"} /><span className="ls-truncate" style={{ fontWeight: 600, color: "var(--omnix-fg)" }} title={m?.name}>{m?.nickname || m?.name || events[0]?.hostName}</span><span className={`ox-num ls-col-meta${events.length ? "" : " is-free"}`}>{events.length ? `${events.length} · ${fmtHours(min)}` : "ว่าง"}</span></>,
      };
    });
  }, [rows, hosts, columnsHosts, date, today]);

  if (!columns.length) return <EmptyState title="ไม่มี Host ในขอบเขตนี้">เพิ่ม Host ได้ที่หน้า “จัดการพนักงาน”</EmptyState>;
  return (
    <>
      {rows.length === 0 && <div className="ox-alert ox-alert--info">ไม่มีรายการไลฟ์ในวันที่ {fmtDY(date)} ตามตัวกรองที่เลือก — ลองเปลี่ยนวันที่หรือล้างตัวกรอง</div>}
      <TimeGrid columns={columns} minCol={168} {...hourRange(rows, fromH, toH, settings)} onOpen={onOpen} conflictIds={conflictIds} hosts={hosts} today={today}
        hideHostInEvent allowEmpty emptyText="" cornerLabel="เวลา" />
    </>
  );
}

/* ---------- รายการ (Agenda) — ใช้บนมือถือ และเป็นมุมมองอ่านง่ายบนจอใหญ่ ---------- */
function AgendaView({ dates, byDate, onOpen, conflictIds, today, hosts, emptyText }: {
  dates: string[]; byDate: Map<string, Schedule[]>; onOpen: (id: string) => void; conflictIds: Map<string, string[]>; today: string; hosts: Map<string, Member>; emptyText: string;
}) {
  const { shopsById } = useStore();
  const days = dates.filter((d) => (byDate.get(d) ?? []).length > 0);
  if (!days.length) return <EmptyState title="ไม่มีรายการในช่วงนี้">{emptyText}</EmptyState>;
  return (
    <div className="ls-agenda">
      {days.map((d) => {
        const list = byDate.get(d)!;
        const min = list.reduce((a, s) => a + (s.status === "CANCELLED" ? 0 : durationMinutes(s)), 0);
        return (
          <section key={d} className="ls-agenda__group" aria-label={fmtLong(d)}>
            <h3 className={`ls-agenda__day${d === today ? " is-today" : ""}`}>
              <span>{fmtLong(d)}</span>{d === today && <span className="ox-badge ox-badge--accent">วันนี้</span>}
              <span className="ox-xs ox-muted ox-num" style={{ marginLeft: "auto", fontWeight: 400 }}>{list.length} ไลฟ์ · {fmtHours(min)}</span>
            </h3>
            <ul className="ls-agenda__list">
              {list.map((s) => {
                const h = hosts.get(s.hostId);
                const conflict = conflictIds.has(s.id);
                return (
                  <li key={s.id}>
                    <button type="button" className={`ls-agenda__item pf-${s.platform}${conflict ? " is-conflict" : ""}${s.status === "CANCELLED" ? " is-cancelled" : ""}`} onClick={() => onOpen(s.id)}>
                      <span className="ls-agenda__time ox-num"><strong>{s.startTime}</strong><span>{s.endTime}</span></span>
                      <span className="ls-agenda__main">
                        <span className="ls-agenda__title">{shopsById.get(s.shopId)?.name ?? s.shopName}</span>
                        <span className="ls-agenda__meta"><PlatformBadge platform={s.platform} /><HostDot color={h?.color ?? "var(--omnix-fg-muted)"} />{h?.nickname || h?.name || s.hostName}<span>· {fmtHours(durationMinutes(s))}</span></span>
                      </span>
                      <span className="ls-agenda__side">
                        {conflict && <span className="ox-badge ox-badge--danger"><ErrorIcon size={12} />ซ้อน</span>}
                        <StatusBadge s={s} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function StatusBadge({ s }: { s: Schedule }) {
  const cls = s.status === "LIVE" ? " ox-badge--danger" : s.status === "DONE" ? " ox-badge--success" : s.status === "CANCELLED" ? "" : " ox-badge--info";
  return <span className={`ox-badge${cls}`}>{STATUS_LABEL[s.status]}</span>;
}

/* ---------- Time grid ที่ใช้ร่วมกัน (Matrix / วัน / สัปดาห์) ---------- */
interface Col { key: string; date: string; isToday: boolean; head: ReactNode; events: Schedule[] }

function layoutLanes(events: Schedule[]) {
  const items = events.map((s) => { const st = toMinutes(s.startTime); return { s, st, en: st + durationMinutes(s), lane: 0, lanes: 1 }; })
    .sort((a, b) => a.st - b.st || b.en - a.en);
  let cluster: typeof items = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;
  const flush = () => { for (const it of cluster) it.lanes = laneEnds.length; cluster = []; laneEnds = []; };
  for (const it of items) {
    if (it.st >= clusterEnd) flush();
    let lane = laneEnds.findIndex((e) => e <= it.st);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(it.en); } else laneEnds[lane] = it.en;
    it.lane = lane;
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.en);
  }
  flush();
  return items;
}

function TimeGrid({ columns, startHour, endHour, minCol, onOpen, conflictIds, hosts, today, emptyText, hideHostInEvent, cornerLabel, allowEmpty }: {
  columns: Col[]; startHour: number; endHour: number; minCol: number; onOpen: (id: string) => void; conflictIds: Map<string, string[]>;
  hosts: Map<string, Member>; today: string; emptyText: string; hideHostInEvent?: boolean; cornerLabel?: string; allowEmpty?: boolean;
}) {
  const [nowMin, setNowMin] = useState<number | null>(null);
  useEffect(() => { const f = () => setNowMin(nowBangkokMinutes()); f(); const id = setInterval(f, 60_000); return () => clearInterval(id); }, []);
  const total = columns.reduce((a, c) => a + c.events.length, 0);
  if (!columns.length || (total === 0 && !allowEmpty)) return <EmptyState title="ไม่มีรายการในช่วงนี้">{emptyText}</EmptyState>;

  const H = 56;
  const span = Math.max(1, endHour - startHour);
  const hours = Array.from({ length: span }, (_, i) => startHour + i);
  return (
    <div className="ls-grid-wrap">
      <div className="ls-grid" style={{ gridTemplateColumns: `64px repeat(${columns.length}, minmax(${minCol}px, 1fr))` }}>
        <div className="ls-grid__corner">{cornerLabel ?? "เวลา"}</div>
        {columns.map((c) => <div key={c.key} className={`ls-grid__head${c.isToday ? " is-today" : ""}`}>{c.head}</div>)}
        <div className="ls-grid__gutter">
          {hours.map((h) => <div key={h} className="ls-grid__hour ox-num">{String(h).padStart(2, "0")}:00</div>)}
        </div>
        {columns.map((c) => (
          <div key={c.key} className={`ls-grid__col${c.isToday ? " is-today" : ""}`} style={{ height: span * H }}>
            {c.date === today && nowMin !== null && nowMin >= startHour * 60 && nowMin <= endHour * 60 && (
              <div className="ls-now" style={{ top: ((nowMin - startHour * 60) / 60) * H }} aria-label="เวลาปัจจุบัน" />
            )}
            {layoutLanes(c.events).map(({ s, st, en, lane, lanes }) => {
              const top = Math.max(0, ((st - startHour * 60) / 60) * H);
              const bottom = Math.min(span * H, ((en - startHour * 60) / 60) * H);
              if (bottom <= 0 || top >= span * H) return null;
              return (
                <div key={s.id} className="ls-grid__ev" style={{ top: top + 1, height: Math.max(24, bottom - top - 2), left: `calc(${(lane / lanes) * 100}% + 3px)`, width: `calc(${100 / lanes}% - 6px)`, right: "auto" }}>
                  <EventChip s={s} onOpen={onOpen} conflict={conflictIds.has(s.id)} host={hosts.get(s.hostId)} hideHost={hideHostInEvent} />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Month ---------- */
function MonthView({ date, dates, byDate, onOpen, onDay, conflictIds, today, hosts }: {
  date: string; dates: string[]; byDate: Map<string, Schedule[]>; onOpen: (id: string) => void; onDay: (d: string) => void;
  conflictIds: Map<string, string[]>; today: string; hosts: Map<string, Member>;
}) {
  const month = date.slice(0, 7);
  const wd = ["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."];
  const weeks = Math.ceil((daysInMonth(month) + (dates.indexOf(`${month}-01`))) / 7);
  // ความหนาแน่นรายวัน (ชั่วโมงไลฟ์) — ให้เห็นวันที่ยุ่งได้ทันที
  const load = new Map(dates.map((d) => [d, (byDate.get(d) ?? []).reduce((a, s) => a + (s.status === "CANCELLED" ? 0 : durationMinutes(s)), 0)]));
  const maxLoad = Math.max(1, ...[...load.entries()].filter(([d]) => d.startsWith(month)).map(([, v]) => v));
  return (
    <div className="ls-month">
      {wd.map((w) => <div key={w} className="ls-month__wd">{w}</div>)}
      {dates.slice(0, weeks * 7).map((d) => {
        const list = byDate.get(d) ?? [];
        const out = !d.startsWith(month);
        return (
          <div key={d} className={`ls-month__cell${out ? " is-out" : ""}${d === today ? " is-today" : ""}${!out && (load.get(d) ?? 0) >= maxLoad * 0.8 && list.length ? " is-busy" : ""}`}>
            <div className="ls-month__day">
              <button type="button" onClick={() => onDay(d)} aria-label={`ดูวันที่ ${fmtDY(d)}`}>{Number(d.slice(8))}</button>
              {list.length > 0 && <span className="ox-xs ox-muted ox-num">{list.length} · {fmtHours(load.get(d) ?? 0)}</span>}
            </div>
            {!out && list.length > 0 && <span className="ls-month__load" aria-hidden><span style={{ width: `${Math.round(((load.get(d) ?? 0) / maxLoad) * 100)}%` }} /></span>}
            {!out && list.slice(0, 3).map((s) => <EventChip key={s.id} s={s} compact onOpen={onOpen} conflict={conflictIds.has(s.id)} host={hosts.get(s.hostId)} />)}
            {!out && list.length > 3 && <button type="button" className="ls-more" onClick={() => onDay(d)}>+{list.length - 3} รายการ</button>}
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Event ---------- */
function EventChip({ s, onOpen, conflict, compact, host, hideHost }: { s: Schedule; onOpen: (id: string) => void; conflict: boolean; compact?: boolean; host?: Member; hideHost?: boolean }) {
  const { shopsById } = useStore();
  const shopName = shopsById.get(s.shopId)?.name ?? s.shopName;
  const hostName = host?.nickname || host?.name || s.hostName;
  const title = `${s.startTime}–${s.endTime} · ${s.platform === "SHOPEE" ? "Shopee" : "TikTok"} · ${shopName} · ${host?.name ?? s.hostName}${conflict ? " · เวลาซ้อนทับ" : ""}${s.status === "CANCELLED" ? " · ยกเลิก" : ""}`;
  return (
    <button type="button" className={`ls-ev pf-${s.platform}${conflict ? " is-conflict" : ""}${s.status === "CANCELLED" ? " is-cancelled" : ""}`} onClick={() => onOpen(s.id)} title={title} aria-label={title}>
      {compact ? (
        <><span className="ls-ev__time">{s.startTime}</span><HostDot color={host?.color ?? "var(--omnix-fg-muted)"} /><span className="ls-ev__title">{shopName}</span></>
      ) : (
        <>
          <span className="ls-ev__time">{s.startTime}–{s.endTime}</span>
          <span className="ls-ev__title">{shopName}</span>
          <span className="ls-ev__meta">{s.platform === "SHOPEE" ? "Shopee" : "TikTok"}{!hideHost && <><span>·</span><HostDot color={host?.color ?? "var(--omnix-fg-muted)"} />{hostName}</>}{s.status !== "SCHEDULED" && <><span>·</span><span className={`ls-ev__status st-${s.status}`}>{STATUS_LABEL[s.status]}</span></>}</span>
        </>
      )}
      {conflict && <span className="ls-ev__flag"><ErrorIcon size={12} /></span>}
    </button>
  );
}

function ConflictAlert({ pairs, onOpen }: { pairs: [Schedule, Schedule][]; onOpen: (id: string) => void }) {
  const [more, setMore] = useState(false);
  const { shopsById, membersById } = useStore();
  const name = (s: Schedule) => `${s.platform === "SHOPEE" ? "Shopee" : "TikTok"} · ${shopsById.get(s.shopId)?.name ?? s.shopName} (${membersById.get(s.hostId)?.nickname ?? s.hostName})`;
  const shown = more ? pairs : pairs.slice(0, 3);
  return (
    <div className="ox-alert ox-alert--danger" role="alert" style={{ flexDirection: "column", gap: 6 }}>
      <strong className="ox-row" style={{ gap: 6 }}><ErrorIcon size={16} />พบเวลาซ้อนทับ {pairs.length} คู่ในช่วงที่แสดง (ตรวจระดับ Global ทุก Host / Shop / Platform)</strong>
      <ul style={{ margin: 0, paddingLeft: 20, color: "var(--omnix-fg)" }}>
        {shown.map(([a, b]) => (
          <li key={a.id + b.id} className="ox-xs">
            <span className="ox-num">{fmtD(a.date)}</span>{" "}
            <a href="#" onClick={(e) => { e.preventDefault(); onOpen(a.id); }}>{a.startTime}–{a.endTime} {name(a)}</a> ซ้อนกับ{" "}
            <a href="#" onClick={(e) => { e.preventDefault(); onOpen(b.id); }}>{b.date !== a.date ? `${fmtD(b.date)} ` : ""}{b.startTime}–{b.endTime} {name(b)}</a>
          </li>
        ))}
      </ul>
      {pairs.length > 3 && <div><Button variant="ghost" size="sm" onClick={() => setMore(!more)}>{more ? "ย่อรายการ" : `ดูทั้งหมด ${pairs.length} คู่`}</Button></div>}
    </div>
  );
}

export function EventModal({ id, onClose, onOpen }: { id: string; onClose: () => void; onOpen: (id: string) => void }) {
  const { schedulesById, shopsById, membersById, conflicts, isAdmin } = useStore();
  const s = schedulesById.get(id);
  if (!s) return null;
  const host = membersById.get(s.hostId);
  const shop = shopsById.get(s.shopId);
  const others = (conflicts.byId.get(s.id) ?? []).map((x) => schedulesById.get(x)!).filter(Boolean);
  return (
    <Modal title="รายละเอียดการไลฟ์" onClose={onClose} foot={<Button variant="secondary" onClick={onClose}>ปิด</Button>}>
      <div className="ox-row"><PlatformBadge platform={s.platform} /><span className="ox-badge">{STATUS_LABEL[s.status]}</span>{s.isDemo && <span className="ox-badge ox-badge--warning">ข้อมูลตัวอย่าง</span>}</div>
      <dl className="ls-kv">
        <dt>วันที่</dt><dd>{fmtLong(s.date)}</dd>
        <dt>เวลา</dt><dd className="ox-num">{s.startTime} – {s.endTime} ({fmtHours(durationMinutes(s))}){toMinutes(s.endTime) <= toMinutes(s.startTime) ? " · ข้ามเที่ยงคืน" : ""}</dd>
        <dt>Shop</dt><dd>{shop?.name ?? s.shopName} <span className="ox-muted ls-mono">({s.shopId})</span></dd>
        <dt>Host</dt><dd className="ox-row">{host && <HostDot color={host.color} />}{host?.name ?? s.hostName} <span className="ox-muted ls-mono">({s.hostId})</span></dd>
        <dt>Schedule ID</dt><dd className="ls-mono">{s.id}</dd>
        <dt>Source / Import Ref.</dt><dd className="ls-mono">{s.source}{s.importRef ? ` · ${s.importRef}` : ""}</dd>
        <dt>Updated At</dt><dd>{fmtTs(s.updatedAt)} (Asia/Bangkok)</dd>
      </dl>
      {others.length > 0 && (
        <div className="ox-alert ox-alert--danger" style={{ flexDirection: "column", gap: 4 }}>
          <strong>เวลาซ้อนทับกับ {others.length} รายการ</strong>
          {others.map((o) => (
            <a key={o.id} href="#" className="ox-xs" onClick={(e) => { e.preventDefault(); onOpen(o.id); }}>
              {fmtD(o.date)} {o.startTime}–{o.endTime} · {o.platform === "SHOPEE" ? "Shopee" : "TikTok"} · {shopsById.get(o.shopId)?.name ?? o.shopName} · {membersById.get(o.hostId)?.name ?? o.hostName}
            </a>
          ))}
        </div>
      )}
      <p className="ox-xs ox-muted">{isAdmin ? "แก้ไขตารางที่ Google Sheets ต้นทาง แล้วนำเข้าใหม่ที่หน้า “นำเข้าข้อมูล”" : "ข้อมูลอ่านอย่างเดียว — ติดต่อผู้ดูแลระบบหากต้องการแก้ไข"}</p>
    </Modal>
  );
}
