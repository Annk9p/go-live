"use client";
// กราฟมาตรฐาน OMNIX ด้วย Recharts — สีอ่านจาก token (สลับธีมได้) · ไม่มี gradient/เงา/animation · แกนเดียว
import { useEffect, useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const TOKENS = ["--omnix-chart-1", "--omnix-chart-2", "--omnix-chart-3", "--omnix-chart-4", "--omnix-chart-5", "--omnix-chart-other", "--omnix-chart-grid", "--omnix-chart-axis", "--omnix-surface", "--omnix-border", "--omnix-fg", "--pf-shopee", "--pf-tiktok"] as const;
type Tok = Record<(typeof TOKENS)[number], string>;

export function useTokens(): Tok | null {
  const [t, setT] = useState<Tok | null>(null);
  useEffect(() => {
    const read = () => {
      const cs = getComputedStyle(document.documentElement);
      setT(Object.fromEntries(TOKENS.map((k) => [k, cs.getPropertyValue(k).trim()])) as Tok);
    };
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", read);
    return () => { mo.disconnect(); mq.removeEventListener("change", read); };
  }, []);
  return t;
}

export function ChartCard({ title, sub, legend, children, wide, empty }: { title: string; sub?: ReactNode; legend?: [string, string][]; children: ReactNode; wide?: boolean; empty?: string | null }) {
  return (
    <div className={`ox-chart${wide ? " is-wide" : ""}`}>
      <div className="ox-chart__head">
        <div><div className="ox-chart__title">{title}</div>{sub && <div className="ox-chart__sub">{sub}</div>}</div>
        {legend && legend.length > 1 && (
          <div className="ox-legend">{legend.map(([n, c]) => <span key={n} className="ox-legend__item"><span className="ox-legend__swatch" style={{ ["--c" as string]: c }} />{n}</span>)}</div>
        )}
      </div>
      <div className="ox-chart__body"><div className="ox-chart__canvas">{empty ? <div className="ox-chart__empty">{empty}</div> : children}</div></div>
    </div>
  );
}

const tooltipStyle = (t: Tok) => ({ background: t["--omnix-surface"], border: `1px solid ${t["--omnix-border"]}`, borderRadius: 8, color: t["--omnix-fg"], fontSize: 12 });

export function LineSeries({ data, series, fmt }: { data: Record<string, string | number>[]; series: { key: string; name: string; color: string }[]; fmt: (v: number) => string }) {
  const t = useTokens();
  if (!t) return <div className="ox-skeleton" style={{ height: "100%" }} />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={t["--omnix-chart-grid"]} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: t["--omnix-chart-axis"], fontSize: 12 }} interval="preserveStartEnd" minTickGap={16} />
        <YAxis tickLine={false} axisLine={false} tick={{ fill: t["--omnix-chart-axis"], fontSize: 12 }} tickFormatter={fmt} allowDecimals={false} width={48} />
        <Tooltip contentStyle={tooltipStyle(t)} formatter={(v) => fmt(Number(v))} />
        {series.map((s) => <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} dot={false} activeDot={{ r: 5 }} isAnimationActive={false} />)}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function BarH({ data, fmt, colorOf }: { data: { name: string; value: number; color?: string }[]; fmt: (v: number) => string; colorOf?: (i: number) => string }) {
  const t = useTokens();
  if (!t) return <div className="ox-skeleton" style={{ height: "100%" }} />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }} barCategoryGap={4}>
        <CartesianGrid horizontal={false} stroke={t["--omnix-chart-grid"]} />
        <XAxis type="number" tickLine={false} axisLine={false} tick={{ fill: t["--omnix-chart-axis"], fontSize: 12 }} tickFormatter={fmt} allowDecimals={false} />
        <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={130} tick={{ fill: t["--omnix-chart-axis"], fontSize: 12 }} tickFormatter={(v: string) => (v.length > 18 ? v.slice(0, 17) + "…" : v)} />
        <Tooltip contentStyle={tooltipStyle(t)} formatter={(v) => fmt(Number(v))} cursor={{ fill: t["--omnix-chart-grid"] }} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={16} isAnimationActive={false}>
          {data.map((d, i) => <Cell key={i} fill={d.color ?? colorOf?.(i) ?? t["--omnix-chart-1"]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export const fmtN = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 });
export const fmtH = (v: number) => `${new Intl.NumberFormat("th-TH", { maximumFractionDigits: 1 }).format(v)} ชม.`;
export const pct = (a: number, b: number) => (b ? ((a - b) / b) * 100 : null);

export function Kpi({ label, value, delta, goodWhenDown, note, tone }: { label: string; value: string; delta?: number | null; goodWhenDown?: boolean; note?: string; tone?: "danger" }) {
  const has = delta !== undefined && delta !== null && isFinite(delta);
  const up = has && delta! >= 0;
  const good = goodWhenDown ? !up : up;
  return (
    <div className={`ox-kpi${tone ? ` ls-kpi--${tone}` : ""}`}>
      <div className="ox-kpi__label">{label}</div>
      <div className="ox-kpi__value">{value}</div>
      {has && (
        <div className={`ox-kpi__delta${good ? " is-up" : " is-down"}`}>
          <svg className="ox-ico" viewBox="0 0 24 24" aria-hidden><path d={up ? "m12 5-7 7 1.4 1.4L11 8.8V19h2V8.8l4.6 4.6L19 12z" : "m12 19 7-7-1.4-1.4L13 15.2V5h-2v10.2l-4.6-4.6L5 12z"} /></svg>
          {`${delta! > 0 ? "+" : ""}${delta!.toFixed(1)}% เทียบเดือนก่อน`}
        </div>
      )}
      {(note || !has) && <div className="ox-kpi__delta">{note ?? "—"}</div>}
    </div>
  );
}
