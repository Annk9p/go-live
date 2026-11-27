"use client";
// โครงแอป: Sidebar (โลโก้ + เมนู) ด้านซ้าย · Header (Breadcrumb + การแจ้งเตือน + เมนูโปรไฟล์) · เนื้อหา
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { StoreProvider, useStore } from "@/lib/store";
import { useVisibility } from "@/lib/visibility";
import { useNotifications, type NotiTone } from "@/lib/notifications";
import { PLATFORMS, platformByCode, platformBySlug, type PlatformCode } from "@/lib/types";
import { storage } from "@/lib/storage";
import { fmtLong, fmtTs, todayBangkok } from "@/lib/time";
import { Avatar, Button, PlatformMark, ToastProvider } from "./ui";
import { AutoSync } from "./AutoSync";
import appIcon from "@/assets/go-live-icon.png";
import {
  BarChart, Bell, Calendar, Check, CheckCircle, CheckDouble, ChevronDown, ChevronRight, Cog, Error as ErrorIcon, File, Grid, Group,
  Import, InfoCircle, Menu, Moon, Shield, Store as StoreIcon, Sun, Swap, User, X,
} from "./icons";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <StoreProvider>
      <ToastProvider>
        <Shell>{children}</Shell>
      </ToastProvider>
    </StoreProvider>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <div className="ox-app ls-app">
      <Suspense fallback={<aside className="ls-sidebar" aria-label="เมนูหลัก" />}><Sidebar open={open} onClose={() => setOpen(false)} /></Suspense>
      <div className={`ls-mask${open ? " is-open" : ""}`} onClick={() => setOpen(false)} aria-hidden />
      <div className="ls-content">
        <Suspense fallback={<header className="ls-header" />}><Header onMenu={() => setOpen((v) => !v)} open={open} /></Suspense>
        <main className="ox-main" id="main">
          <div className="ox-main__inner ls-main-inner">{children}</div>
        </main>
      </div>
      <AutoSync />
    </div>
  );
}

/* ================= Sidebar ================= */
function Brand() {
  return (
    <Link href="/schedule/me" className="ls-brand" aria-label="GO LIVE — ไปที่ตารางไลฟ์ของฉัน">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={appIcon.src} width={40} height={40} alt="" className="ls-brand__icon" />
      <span className="ls-brand__text"><strong className="ls-brand__name">GO <span className="ls-brand__live">LIVE</span></strong><span>TEAM WORKSPACE</span></span>
    </Link>
  );
}

function NavItem({ href, icon, children, exact }: { href: string; icon?: ReactNode; children: ReactNode; exact?: boolean }) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
  return (
    <Link href={href} className={`ox-nav-item${active ? " is-active" : ""}`} aria-current={active ? "page" : undefined}>
      {icon}<span className="ls-truncate">{children}</span>
    </Link>
  );
}

function PlatformGroup({ platform }: { platform: PlatformCode }) {
  const p = PLATFORMS.find((x) => x.code === platform)!;
  const { shopsOf } = useVisibility();
  const shops = shopsOf(platform);
  const key = `live-schedule:nav:${p.slug}`;
  const pathname = usePathname();
  const { shopsById } = useStore();
  const shopId = useSearchParams().get("id");
  const currentShop = pathname === "/shop" && shopId ? shopId : null;
  const here = pathname === `/platform/${p.slug}` || (!!currentShop && shopsById.get(currentShop)?.platform === platform);
  const [expanded, setExpanded] = useState(true);
  useEffect(() => { const v = storage.get<boolean>(key); if (v !== null) setExpanded(v); }, [key]);
  // เปิดกลุ่มอัตโนมัติเมื่ออยู่ในหน้าของ Platform นี้ เพื่อให้เห็นเมนูที่เลือกอยู่
  useEffect(() => { if (here) setExpanded(true); }, [here]);
  const toggle = () => { storage.set(key, !expanded); setExpanded(!expanded); };
  return (
    <div className={`ls-pf-group pf-${platform}${here ? " is-here" : ""}`}>
      <button type="button" className="ls-nav-toggle" aria-expanded={expanded} aria-controls={`nav-${p.slug}`} onClick={toggle}>
        <PlatformMark platform={platform} /><span>{p.name}</span>
        <span className="ls-nav-count ox-num" aria-label={`${shops.length} ร้าน`}>{shops.length}</span>
        <ChevronDown size={16} className="ls-chev" />
      </button>
      {expanded && (
        <div className="ls-subnav" id={`nav-${p.slug}`}>
          <NavItem href={`/platform/${p.slug}`} icon={<Grid size={14} />}>ตาราง {p.name} รวม</NavItem>
          {shops.length > 0 && <div className="ls-subnav__label">ร้านค้า</div>}
          {shops.map((s) => {
            const active = currentShop === s.id;
            return (
              <Link key={s.id} href={`/shop?id=${s.id}`} className={`ox-nav-item ls-shop-link${active ? " is-active" : ""}${s.active ? "" : " is-inactive"}`} aria-current={active ? "page" : undefined} title={s.active ? s.name : `${s.name} (ปิดใช้งาน)`}>
                <StoreIcon size={14} /><span className="ls-truncate">{s.name}</span>{!s.active && <span className="ox-xs ox-muted">ปิด</span>}
              </Link>
            );
          })}
          {shops.length === 0 && <span className="ox-xs ox-muted ls-subnav__empty">ยังไม่มีร้าน</span>}
        </div>
      )}
    </div>
  );
}

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { isAdmin } = useStore();
  return (
    <aside className={`ls-sidebar${open ? " is-open" : ""}`} aria-label="เมนูหลัก">
      <div className="ls-sidebar__top">
        <Brand />
        <Button variant="ghost" icon className="ls-sidebar__close" aria-label="ปิดเมนู" onClick={onClose}><X size={18} /></Button>
      </div>
      <nav className="ls-sidebar__nav">
        <div className="ls-nav-label">ตารางไลฟ์</div>
        <NavItem href="/schedule/me" icon={<User size={16} />}>ตารางไลฟ์ของฉัน</NavItem>
        <NavItem href="/schedule/team" icon={<Calendar size={16} />}>ตารางไลฟ์ทีม</NavItem>

        <div className="ls-nav-label">แพลตฟอร์ม</div>
        <PlatformGroup platform="SHOPEE" />
        <PlatformGroup platform="TIKTOK" />

        <div className="ls-nav-label">ข้อมูลทีม</div>
        <NavItem href="/team/members" icon={<Group size={16} />}>สมาชิกในทีม</NavItem>
        <NavItem href="/team/summary" icon={<BarChart size={16} />}>สรุปผลงานของฉัน</NavItem>

        {isAdmin && (
          <>
            <div className="ls-nav-label">จัดการระบบ</div>
            <NavItem href="/admin/dashboard" icon={<Grid size={16} />}>ภาพรวมระบบ</NavItem>
            <NavItem href="/admin/import" icon={<Import size={16} />}>นำเข้าข้อมูล</NavItem>
            <NavItem href="/admin/shops" icon={<StoreIcon size={16} />}>จัดการร้านค้า</NavItem>
            <NavItem href="/admin/members" icon={<Shield size={16} />}>จัดการพนักงาน</NavItem>
            <NavItem href="/admin/reports" icon={<File size={16} />}>รายงาน</NavItem>
            <NavItem href="/admin/settings" icon={<Cog size={16} />}>ตั้งค่าระบบ</NavItem>
          </>
        )}
      </nav>
      <WorkspaceCard />
    </aside>
  );
}

/** การ์ดท้าย Sidebar: สถานะพื้นที่ทำงาน (ข้อมูลตัวอย่าง / Auto Sync) + ผู้ที่เข้าสู่ระบบ */
function WorkspaceCard() {
  const { db, me, isAdmin, hasDemo } = useStore();
  const sync = db.settings.autoSyncEnabled ? `Auto Sync ทุก ${db.settings.autoSyncIntervalMin} นาที` : "Auto Sync ปิดอยู่";
  return (
    <div className="ls-ws-card">
      <div className="ls-ws-card__title">สถานะพื้นที่ทำงาน</div>
      <div className="ls-ws-card__line">
        {db.published ? <>ข้อมูลจริงจาก Google Sheets</> : hasDemo ? <>ข้อมูลตัวอย่าง · โหมดทดลอง</> : <>ข้อมูลจริง · {sync}</>}
      </div>
      <div className="ls-ws-card__line">{db.published ? <>ซิงก์ล่าสุด {fmtTs(db.published.generatedAt)}</> : hasDemo ? sync : null}</div>
      <div className="ls-ws-card__k">เข้าสู่ระบบเป็น</div>
      <div className="ls-ws-card__me">
        <Avatar member={me} />
        <span style={{ minWidth: 0 }}><span className="ls-truncate" style={{ display: "block", fontWeight: 600 }}>{me.name}</span><span className="ox-xs ox-muted">{isAdmin ? "ผู้ดูแลระบบ" : "พนักงาน"}{me.isHost ? " · Host" : ""}</span></span>
      </div>
    </div>
  );
}

/* ================= Header ================= */
type Crumb = { label: ReactNode; href?: string };

function useCrumbs(): Crumb[] {
  const pathname = usePathname();
  const { shopsById } = useStore();
  const shopParam = useSearchParams().get("id") ?? "";
  const seg = pathname.split("/").filter(Boolean);
  const pages: Record<string, [string, string]> = {
    "/schedule/me": ["ตารางไลฟ์", "ตารางไลฟ์ของฉัน"], "/schedule/team": ["ตารางไลฟ์", "ตารางไลฟ์ทีม"],
    "/team/members": ["ข้อมูลทีม", "สมาชิกในทีม"], "/team/summary": ["ข้อมูลทีม", "สรุปผลงานของฉัน"],
    "/admin/dashboard": ["จัดการระบบ", "ภาพรวมระบบ"], "/admin/import": ["จัดการระบบ", "นำเข้าข้อมูล"],
    "/admin/shops": ["จัดการระบบ", "จัดการร้านค้า"], "/admin/members": ["จัดการระบบ", "จัดการพนักงาน"],
    "/admin/reports": ["จัดการระบบ", "รายงาน"], "/admin/settings": ["จัดการระบบ", "ตั้งค่าระบบ"],
  };
  if (pages[pathname]) return [{ label: pages[pathname][0] }, { label: pages[pathname][1] }];
  if (seg[0] === "platform") {
    const p = platformBySlug(seg[1] ?? "");
    return p ? [{ label: <><PlatformMark platform={p.code} />{p.name}</> }, { label: `ตาราง ${p.name} รวม` }] : [{ label: "ไม่พบหน้า" }];
  }
  if (seg[0] === "shop") {
    const shop = shopsById.get(shopParam);
    if (!shop) return [{ label: "ร้านค้า" }, { label: "ไม่พบร้าน" }];
    const p = platformByCode(shop.platform);
    return [{ label: <><PlatformMark platform={p.code} />{p.name}</>, href: `/platform/${p.slug}` }, { label: shop.name }];
  }
  return [{ label: "GO LIVE" }];
}

/** สถานะระบบจากข้อมูลจริง: แหล่ง Auto Sync ที่ล้มเหลว / การนำเข้าล่าสุดไม่ผ่าน */
function useSystemStatus(): { tone: "ok" | "warn"; text: string } {
  const { db } = useStore();
  const badTabs = db.published?.tabs.filter((t) => t.status === "ERROR_KEPT").length ?? 0;
  if (badTabs) return { tone: "warn", text: `ชีตมีข้อผิดพลาด ${badTabs} แท็บ` };
  if (db.published) {
    const ageMin = (Date.now() - new Date(db.published.generatedAt).getTime()) / 60000;
    if (ageMin > 120) return { tone: "warn", text: "ซิงก์ชีตล่าช้า" };
    return { tone: "ok", text: "ซิงก์ชีตแล้ว" };
  }
  const failing = db.sources.filter((s) => s.enabled && s.lastStatus && /ล้มเหลว|ไม่ผ่าน/.test(s.lastStatus));
  if (failing.length) return { tone: "warn", text: `Auto Sync มีปัญหา ${failing.length} แหล่ง` };
  const last = db.imports[0];
  if (last && last.status === "REJECTED") return { tone: "warn", text: "นำเข้าล่าสุดไม่ผ่านการตรวจ" };
  return { tone: "ok", text: "ระบบทำงานปกติ" };
}

function Header({ onMenu, open }: { onMenu: () => void; open: boolean }) {
  const crumbs = useCrumbs();
  const { isAdmin, db: db0 } = useStore();
  const status = useSystemStatus();
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(todayBangkok()), []);
  const title = crumbs[crumbs.length - 1];
  const parents = crumbs.slice(0, -1);
  const pill = <><span className="ls-status__dot" aria-hidden />{status.text}</>;
  return (
    <header className="ls-header">
      <Button variant="ghost" icon className="ls-burger" aria-label={open ? "ปิดเมนู" : "เปิดเมนู"} aria-expanded={open} onClick={onMenu}>
        <Menu size={20} />
      </Button>
      <div className="ls-header__title">
        <div className="ls-header__h">{title.label}</div>
        <nav aria-label="Breadcrumb" className="ls-header__sub">
          {today && <span className="ls-hide-sm">{fmtLong(today)}</span>}
          {parents.map((c, i) => (
            <span key={i} className="ls-header__crumb">
              <span className="ls-hide-sm" aria-hidden>·</span>
              {c.href ? <Link href={c.href}>{c.label}</Link> : <span>{c.label}</span>}
            </span>
          ))}
        </nav>
      </div>
      <span className="ls-header__spacer" />
      {isAdmin
        ? <Link href={db0.published ? "/admin/import?tab=sheet" : "/admin/import?tab=sync"} className={`ls-status is-${status.tone} ls-hide-md`} title="ดูสถานะการนำเข้าและ Auto Sync">{pill}</Link>
        : <span className={`ls-status is-${status.tone} ls-hide-md`}>{pill}</span>}
      <Notifications />
      <ProfileMenu />
    </header>
  );
}

/** ปิดเมื่อคลิกนอกกล่อง / กด Escape */
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); (ref.current?.querySelector("button") as HTMLButtonElement | null)?.focus(); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return { open, setOpen, ref };
}

const TONE_ICON: Record<NotiTone, ReactNode> = {
  danger: <ErrorIcon size={16} />, warning: <ErrorIcon size={16} />, success: <CheckCircle size={16} />, info: <InfoCircle size={16} />,
};

function Notifications() {
  const { open, setOpen, ref } = usePopover();
  const { items, unread, seen, markAll, markOne } = useNotifications();
  const router = useRouter();
  return (
    <div className="ls-pop" ref={ref}>
      <Button variant="ghost" icon aria-label={unread ? `การแจ้งเตือน ${unread} รายการใหม่` : "การแจ้งเตือน"} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)} className="ls-bell">
        <Bell size={20} />{unread > 0 && <span className="ls-bell__count ox-num">{unread > 9 ? "9+" : unread}</span>}
      </Button>
      {open && (
        <div className="ls-pop__panel ls-noti" role="dialog" aria-label="การแจ้งเตือน">
          <div className="ls-pop__head">
            <strong>การแจ้งเตือน</strong>
            {unread > 0 && <Button variant="ghost" size="sm" onClick={markAll}><CheckDouble size={14} />อ่านทั้งหมดแล้ว</Button>}
          </div>
          {items.length === 0 ? (
            <div className="ls-noti__empty"><Check size={20} /><span>ไม่มีการแจ้งเตือน</span><span className="ox-xs ox-muted">ไม่มีเวลาซ้อนทับและการนำเข้าที่ต้องติดตาม</span></div>
          ) : (
            <ul className="ls-noti__list">
              {items.map((n) => (
                <li key={n.id}>
                  <button type="button" className={`ls-noti__item tone-${n.tone}${seen.includes(n.id) ? "" : " is-unread"}`} onClick={() => { markOne(n.id); setOpen(false); router.push(n.href); }}>
                    <span className="ls-noti__icon">{TONE_ICON[n.tone]}</span>
                    <span className="ls-noti__body">
                      <span className="ls-noti__title">{n.title}</span>
                      <span className="ls-noti__detail">{n.detail}</span>
                      {n.at.includes("Z") && <span className="ls-noti__at">{fmtTs(n.at)}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function ProfileMenu() {
  const { open, setOpen, ref } = usePopover();
  const { db, me, isAdmin, switchUser } = useStore();
  const [dark, setDark] = useState<boolean | null>(null);
  const [switching, setSwitching] = useState(false);
  useEffect(() => {
    const saved = storage.get<"light" | "dark">("live-schedule:theme");
    apply(saved ? saved === "dark" : matchMedia("(prefers-color-scheme: dark)").matches);
  }, []);
  useEffect(() => { if (!open) setSwitching(false); }, [open]);
  function apply(isDark: boolean) {
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
    document.documentElement.classList.toggle("dark", isDark);
    setDark(isDark);
  }
  return (
    <div className="ls-pop" ref={ref}>
      <button type="button" className="ls-profile-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} aria-label={`เมนูโปรไฟล์: ${me.name}`}>
        <Avatar member={me} large />
      </button>
      {open && (
        <div className="ls-pop__panel ls-menu" role="menu" aria-label="เมนูโปรไฟล์">
          <div className="ls-menu__me">
            <Avatar member={me} large />
            <div style={{ minWidth: 0 }}>
              <div className="ls-truncate" style={{ fontWeight: 600 }}>{me.name}</div>
              <div className="ox-xs ox-muted ls-truncate">{me.email || "—"}</div>
              <div className="ox-row" style={{ gap: 4, marginTop: 4 }}>
                <span className={`ox-badge${isAdmin ? " ox-badge--accent" : ""}`}>{isAdmin ? "Admin" : "Employee"}</span>
                {me.isHost && <span className="ox-badge" style={{ ["--c" as string]: me.color }}>Host</span>}
              </div>
            </div>
          </div>
          {!switching ? (
            <>
              <div className="ls-menu__sep" />
              <Link role="menuitem" className="ls-menu__item" href="/schedule/me"><User size={16} />ตารางไลฟ์ของฉัน</Link>
              <Link role="menuitem" className="ls-menu__item" href="/team/summary"><BarChart size={16} />สรุปผลงานของฉัน</Link>
              <button role="menuitem" type="button" className="ls-menu__item" onClick={() => { const n = !dark; storage.set("live-schedule:theme", n ? "dark" : "light"); apply(n); }}>
                {dark ? <Sun size={16} /> : <Moon size={16} />}{dark ? "ใช้ธีมสว่าง" : "ใช้ธีมมืด"}
              </button>
              <div className="ls-menu__sep" />
              <button role="menuitem" type="button" className="ls-menu__item" onClick={() => setSwitching(true)}>
                <Swap size={16} />สลับผู้ใช้ (ทดสอบสิทธิ์)<ChevronRight size={16} style={{ marginLeft: "auto" }} />
              </button>
              <p className="ls-menu__note">ระบบ Login จริงจะเปิดใช้ใน Phase 3 — ตอนนี้ใช้สลับผู้ใช้เพื่อทดสอบสิทธิ์ Admin / Employee</p>
            </>
          ) : (
            <>
              <div className="ls-menu__sep" />
              <div className="ls-menu__label">เข้าสู่ระบบเป็น</div>
              <div className="ls-menu__scroll">
                {db.members.filter((m) => m.active).map((m) => (
                  <button key={m.id} role="menuitemradio" aria-checked={m.id === me.id} type="button" className="ls-menu__item" onClick={() => { switchUser(m.id); setOpen(false); }}>
                    <Avatar member={m} /><span className="ls-truncate">{m.name}</span>
                    <span className="ox-xs ox-muted" style={{ marginLeft: "auto" }}>{m.role === "ADMIN" ? "Admin" : "Employee"}</span>
                    {m.id === me.id && <Check size={16} className="ls-menu__check" />}
                  </button>
                ))}
              </div>
              <button type="button" className="ls-menu__item ox-muted" onClick={() => setSwitching(false)}>ย้อนกลับ</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
