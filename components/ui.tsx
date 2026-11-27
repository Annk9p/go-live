"use client";
// คอมโพเนนต์พื้นฐาน (OMNIX) — หยิบจากที่นี่ก่อนเขียน markup ใหม่
import { TiktokLogo } from "./icons";
import { createContext, useCallback, useContext, useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { Member, PlatformCode } from "@/lib/types";
import { platformByCode } from "@/lib/types";
import { CheckCircle, ErrorCircle, X } from "./icons";

export const CONTROL_CLASS = "ox-control";

type BtnVariant = "primary" | "secondary" | "ghost" | "danger";
export function Button({ variant = "secondary", size, icon, className = "", ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm"; icon?: boolean }) {
  return <button type="button" {...p} className={`ox-btn ox-btn--${variant}${size ? " ox-btn--sm" : ""}${icon ? " ox-btn--icon" : ""} ${className}`} />;
}

export function Card({ children, className = "", foot }: { children: ReactNode; className?: string; foot?: ReactNode }) {
  return (
    <div className={`ox-card ${className}`}>
      <div className="ox-card__body">{children}</div>
      {foot && <div className="ox-card__foot">{foot}</div>}
    </div>
  );
}

export function SectionTitle({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return <div className="ox-section-title"><h2>{title}</h2>{children && <div className="ox-row">{children}</div>}</div>;
}

export function PageHead({ title, desc, children }: { title: ReactNode; desc?: ReactNode; children?: ReactNode }) {
  return (
    <div className="ox-page-head">
      <div className="ox-stack" style={{ gap: 4 }}>
        <h1 className="ox-page-title">{title}</h1>
        {desc && <p className="ox-muted">{desc}</p>}
      </div>
      {children && <div className="ox-page-head__actions">{children}</div>}
    </div>
  );
}

export function Field({ label, required, help, error, children, htmlFor }: { label: string; required?: boolean; help?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="ox-field">
      <label className={`ox-label${required ? " ox-label--required" : ""}`} htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <span className="ox-error">{error}</span> : help ? <span className="ox-help">{help}</span> : null}
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className="ox-toggle">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="ox-toggle__track" />
      <span>{label}</span>
    </label>
  );
}

export function Segment<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="ox-segment" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} className={value === o.value ? "is-active" : ""} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Modal({ title, onClose, children, foot, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; foot?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="ox-modal-mask" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`ox-modal${wide ? " ls-modal-wide" : ""}`} role="dialog" aria-modal="true">
        <div className="ox-modal__head ox-row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
          <span>{title}</span>
          <Button variant="ghost" size="sm" icon aria-label="ปิด" onClick={onClose}><X size={16} /></Button>
        </div>
        <div className="ox-modal__body">{children}</div>
        {foot && <div className="ox-modal__foot">{foot}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="ox-empty">
      <div className="ox-empty__title">{title}</div>
      {children && <div>{children}</div>}
      {action}
    </div>
  );
}

export function PlatformBadge({ platform }: { platform: PlatformCode }) {
  return <span className={`ls-pf-badge pf-${platform}`}><PlatformMark platform={platform} size={14} />{platformByCode(platform).name}</span>;
}

/** ไอคอนแบบแอปของแต่ละ Platform — Shopee: ถุงช้อปปิ้งบนพื้นส้ม · TikTok: โน้ตดนตรีมีเงาฟ้า/แดงบนพื้นดำ */
export function PlatformMark({ platform, size = 18 }: { platform: PlatformCode; size?: number }) {
  const style = { width: size, height: size };
  if (platform === "SHOPEE") {
    return (
      <span className="ls-app-ico ls-app-ico--shopee" style={style} aria-hidden>
        <svg viewBox="0 0 24 24" width="74%" height="74%">
          <path d="M8.6 8.2V6.9a3.4 3.4 0 0 1 6.8 0v1.3" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" />
          <path d="M5.2 8.2h13.6l-.9 11.4a1.6 1.6 0 0 1-1.6 1.4H7.7a1.6 1.6 0 0 1-1.6-1.4z" fill="#fff" />
          <path d="M14.2 12.1c-.4-.6-1.2-.9-2.1-.9-1.2 0-2.1.6-2.1 1.5 0 2.1 4.4 1.1 4.4 3.4 0 1-1 1.6-2.3 1.6-1 0-1.9-.4-2.4-1.1" fill="none" stroke="var(--pf-shopee)" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  return (
    <span className="ls-app-ico ls-app-ico--tiktok" style={style} aria-hidden>
      <svg viewBox="0 0 24 24" width="66%" height="66%">
        <g transform="translate(-0.7 -0.5)" fill="#25f4ee"><TiktokPath /></g>
        <g transform="translate(0.7 0.5)" fill="#fe2c55"><TiktokPath /></g>
        <g fill="#fff"><TiktokPath /></g>
      </svg>
    </span>
  );
}

function TiktokPath() {
  // ใช้ path จากไอคอนที่สร้างอัตโนมัติ (Boxicons logos: bxl-tiktok)
  const svg = TiktokLogo({});
  return <>{svg.props.children}</>;
}

export function HostDot({ color }: { color: string }) {
  return <span className="ls-host-dot" style={{ ["--c" as string]: color }} aria-hidden />;
}

export function Avatar({ member, large }: { member: Pick<Member, "nickname" | "name" | "color">; large?: boolean }) {
  return <span className={`ls-avatar${large ? " ls-avatar--lg" : ""}`} style={{ ["--c" as string]: member.color }} aria-hidden>{(member.nickname || member.name).slice(0, 1)}</span>;
}

/* ---------- Toast ---------- */
type Toast = { id: number; kind: "success" | "danger"; text: string };
const ToastCtx = createContext<(kind: Toast["kind"], text: string) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, kind, text }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div style={{ position: "fixed", right: 16, bottom: 16, zIndex: 60, display: "flex", flexDirection: "column", gap: 8, maxWidth: "min(420px, calc(100vw - 32px))" }} aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`ox-alert ox-alert--${t.kind}`} role="status" style={{ background: "var(--omnix-surface)", borderColor: "currentColor" }}>
            {t.kind === "success" ? <CheckCircle size={18} /> : <ErrorCircle size={18} />}<span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/** เรียก action ของ store แล้วแจ้งผลด้วย toast */
export function useAction() {
  const toast = useToast();
  return useCallback(<T,>(fn: () => T, ok?: string): T | undefined => {
    try {
      const r = fn();
      if (ok) toast("success", ok);
      return r;
    } catch (e) {
      toast("danger", e instanceof Error ? e.message : String(e));
      return undefined;
    }
  }, [toast]);
}
