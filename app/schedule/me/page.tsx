"use client";
// ตารางไลฟ์ของฉัน — ภาพรวมวันนี้ (ทักทาย · KPI · ตารางวันนี้ · สัปดาห์นี้) แล้วตามด้วยตารางเต็ม (Matrix / Calendar / รายการ)
import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { ScheduleBoard, EventModal } from "@/components/ScheduleBoard";
import { EmptyState, PlatformBadge } from "@/components/ui";
import { ChevronRight, Error as ErrorIcon } from "@/components/icons";
import { STATUS_LABEL, type Schedule } from "@/lib/types";
import { absInterval, addDays, dayIndex, durationMinutes, fmtD, fmtHours, fmtLong, nowBangkokMinutes, startOfWeek, todayBangkok } from "@/lib/time";

const pfName = (p: string) => (p === "SHOPEE" ? "Shopee" : "TikTok");

function greeting(min: number) {
  if (min < 12 * 60) return "สวัสดีตอนเช้า";
  if (min < 17 * 60) return "สวัสดีตอนบ่าย";
  return "สวัสดีตอนเย็น";
}

function MyPage() {
  const { me, db, shopsById, conflicts } = useStore();
  const q = useSearchParams();
  const date = q.get("date") ?? undefined, open = q.get("open") ?? undefined;
  const base = useCallback((s: Schedule) => s.hostId === me.id, [me.id]);
  const [now, setNow] = useState<{ today: string; min: number } | null>(null);
  useEffect(() => { const f = () => setNow({ today: todayBangkok(), min: nowBangkokMinutes() }); f(); const id = setInterval(f, 60_000); return () => clearInterval(id); }, []);
  const [detail, setDetail] = useState<string | null>(null);

  const mine = useMemo(() => db.schedules.filter((s) => s.hostId === me.id).sort((a, b) => absInterval(a)[0] - absInterval(b)[0]), [db.schedules, me.id]);
  const view = useMemo(() => {
    if (!now) return null;
    const live = mine.filter((s) => s.status !== "CANCELLED");
    const nowAbs = dayIndex(now.today) * 1440 + now.min;
    const todayList = mine.filter((s) => s.date === now.today);
    const weekStart = startOfWeek(now.today), weekEnd = addDays(weekStart, 7);
    const weekMin = live.filter((s) => s.date >= weekStart && s.date < weekEnd).reduce((a, s) => a + durationMinutes(s), 0);
    const next = live.find((s) => absInterval(s)[1] > nowAbs);
    const upcoming = Array.from({ length: 6 }, (_, i) => addDays(now.today, i + 1)).map((d) => {
      const l = live.filter((s) => s.date === d);
      return { date: d, count: l.length, minutes: l.reduce((a, s) => a + durationMinutes(s), 0) };
    });
    const doneToday = todayList.filter((s) => s.status !== "CANCELLED" && absInterval(s)[1] <= nowAbs).length;
    return { nowAbs, todayList, todayLive: todayList.filter((s) => s.status !== "CANCELLED").length, doneToday, weekMin, next, upcoming };
  }, [mine, now]);

  const name = me.nickname || me.name;
  return (
    <>
      <div className="ls-hello">
        <div>
          <h1 className="ls-hello__h">{now ? greeting(now.min) : "สวัสดี"}, {name}</h1>
          <p className="ox-muted">{me.isHost ? "นี่คือตารางไลฟ์ของคุณวันนี้" : "บัญชีนี้ไม่ได้ตั้งเป็น Host จึงไม่มีตารางไลฟ์ส่วนตัว"}</p>
        </div>
        <Link href="/schedule/team" className="ox-btn ox-btn--secondary">ดูตารางไลฟ์ทีม<ChevronRight size={16} /></Link>
      </div>

      {!me.isHost ? (
        <EmptyState title="ยังไม่มีตารางไลฟ์ส่วนตัว" action={<Link className="ox-btn ox-btn--primary" href="/schedule/team">ไปที่ตารางไลฟ์ทีม</Link>}>ดูตารางของทุกคนได้ที่ “ตารางไลฟ์ทีม”</EmptyState>
      ) : !view ? (
        <div className="ox-skeleton" style={{ height: 160 }} />
      ) : (
        <>
          <div className="ls-hello-kpis">
            <div className="ox-kpi">
              <div className="ox-kpi__label">ไลฟ์วันนี้</div>
              <div className="ox-kpi__value">{view.todayLive}</div>
              <div className="ox-kpi__delta is-up">{view.todayLive ? `เสร็จแล้ว ${view.doneToday} · เหลือ ${view.todayLive - view.doneToday}` : "ไม่มีไลฟ์วันนี้"}</div>
            </div>
            <div className="ox-kpi">
              <div className="ox-kpi__label">ชั่วโมงไลฟ์</div>
              <div className="ox-kpi__value ox-num" title={fmtHours(view.weekMin)}>{(view.weekMin / 60).toLocaleString("th-TH", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ชม.</div>
              <div className="ox-kpi__delta">สัปดาห์นี้ (จ.–อา.)</div>
            </div>
            <div className="ox-kpi">
              <div className="ox-kpi__label">{view.next && absInterval(view.next)[0] <= view.nowAbs ? "กำลังไลฟ์" : "ไลฟ์ถัดไป"}</div>
              <div className="ox-kpi__value">{view.next ? view.next.startTime : "—"}</div>
              <div className="ox-kpi__delta">
                {view.next ? <>{view.next.date !== now!.today && `${fmtD(view.next.date)} · `}{pfName(view.next.platform)} · {shopsById.get(view.next.shopId)?.name ?? view.next.shopName}</> : "ไม่มีไลฟ์ที่กำลังจะถึง"}
              </div>
            </div>
          </div>

          <section className="ox-card ls-today" aria-labelledby="today-h">
            <div className="ls-today__head"><h2 id="today-h">ตารางวันนี้</h2><span className="ox-muted">{fmtLong(now!.today)}</span></div>
            {view.todayList.length === 0 ? (
              <p className="ox-muted ls-today__empty">วันนี้ไม่มีไลฟ์ — ดูวันถัดไปได้ที่ “สัปดาห์นี้” ด้านล่าง</p>
            ) : (
              <ol className="ls-timeline">
                {view.todayList.map((s) => {
                  const [a, b] = absInterval(s);
                  const state = s.status === "CANCELLED" ? "cancelled" : b <= view.nowAbs ? "past" : a <= view.nowAbs ? "now" : "next";
                  const shop = shopsById.get(s.shopId)?.name ?? s.shopName;
                  const conflict = conflicts.byId.has(s.id);
                  return (
                    <li key={s.id} className={`ls-timeline__row is-${state}`}>
                      <span className="ls-timeline__time ox-num">{s.startTime}</span>
                      <button type="button" className={`ls-timeline__card pf-${s.platform}${conflict ? " is-conflict" : ""}`} onClick={() => setDetail(s.id)}>
                        <span className="ls-timeline__main">
                          <span className="ls-timeline__title">{pfName(s.platform)} · {shop}</span>
                          <span className="ls-timeline__sub ox-num">{s.startTime} – {s.endTime} · {me.nickname || me.name} · {fmtHours(durationMinutes(s))}</span>
                        </span>
                        <span className="ls-timeline__side">
                          <PlatformBadge platform={s.platform} />
                          {state === "now" ? <span className="ox-badge ox-badge--danger">กำลังไลฟ์</span>
                            : state === "past" || s.status === "CANCELLED" ? <span className="ox-badge">{s.status === "CANCELLED" ? STATUS_LABEL.CANCELLED : "เสร็จแล้ว"}</span> : null}
                          {conflict && <span className="ox-badge ox-badge--danger"><ErrorIcon size={12} />เวลาซ้อน</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <section className="ox-card ls-upcoming" aria-labelledby="up-h">
            <div className="ls-today__head"><h2 id="up-h">สัปดาห์นี้</h2><span className="ox-muted ox-xs">6 วันถัดไป · กดเพื่อดูตารางวันนั้น</span></div>
            <ul>
              {view.upcoming.map((d) => (
                <li key={d.date}>
                  <Link href={`/schedule/me?date=${d.date}#board`} className={d.count ? undefined : "is-empty"}>
                    <span className="ls-upcoming__d">{fmtLong(d.date).replace(/ \d{4}$/, "")}</span>
                    <strong className="ox-num">{d.count ? `${d.count} ไลฟ์` : "ว่าง"}</strong>
                    {d.count > 0 && <span className="ox-muted ox-xs ox-num">{fmtHours(d.minutes)}</span>}
                    <ChevronRight size={16} className="ls-upcoming__go" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section id="board" className="ox-stack" aria-labelledby="board-h" style={{ scrollMarginTop: 90 }}>
            <h2 id="board-h" className="ls-section-h">ตารางทั้งหมดของฉัน</h2>
            <ScheduleBoard key={`me-${me.id}-${date}-${open}`} pageKey="me" base={base} hostScope="page" initialDate={date} initialOpen={open} show={{ platform: true, shop: true }} />
          </section>
        </>
      )}
      {detail && <EventModal id={detail} onClose={() => setDetail(null)} onOpen={setDetail} />}
    </>
  );
}

export default function MySchedulePage() {
  return <Suspense fallback={<div className="ox-skeleton" style={{ height: 400 }} />}><MyPage /></Suspense>;
}
