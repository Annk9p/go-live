"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { scopeText, useStore } from "@/lib/store";
import { PLATFORMS, type ImportBatch, type ImportScope, type PlatformCode, type SyncSource } from "@/lib/types";
import { contentHash, diffScope, inScope, TEMPLATE_HEADER, validateRows, type Diff, type ValidationResult } from "@/lib/import";
import { fetchSheetCsv, runSync } from "@/lib/sync";
import { fmtTs, todayBangkok } from "@/lib/time";
import { AdminOnly } from "@/components/AdminOnly";
import { Button, EmptyState, Field, Modal, PageHead, PlatformBadge, Segment, Toggle, useAction, useToast } from "@/components/ui";
import { Download, Edit, Plus, Refresh, Sheet, Trash, Undo } from "@/components/icons";

type Tab = "manual" | "sync" | "history" | "errors";

export default function ImportPage() {
  return <AdminOnly><Suspense fallback={<div className="ox-skeleton" style={{ height: 400 }} />}><ImportInner /></Suspense></AdminOnly>;
}

function ImportInner() {
  const [tab, setTab] = useState<Tab>("manual");
  const [errBatch, setErrBatch] = useState<string | null>(null);
  const { db } = useStore();
  // เปิดแท็บจากลิงก์ (เช่น จากการแจ้งเตือน: ?tab=errors)
  const qTab = useSearchParams().get("tab");
  useEffect(() => { if (qTab === "manual" || qTab === "sync" || qTab === "history" || qTab === "errors") setTab(qTab); }, [qTab]);
  return (
    <>
      <PageHead title="นำเข้าข้อมูล" desc="Google Sheets คือแหล่งข้อมูลต้นทาง — ตรวจสอบก่อน Replace และแทนที่เฉพาะ Scope ที่เลือกเท่านั้น" />
      <Segment<Tab> label="ส่วนของหน้า" value={tab} onChange={setTab} options={[
        { value: "manual", label: "นำเข้าด้วยตนเอง" },
        { value: "sync", label: `Auto Sync (${db.sources.length})` },
        { value: "history", label: "ประวัติการนำเข้า" },
        { value: "errors", label: "Error Log" },
      ]} />
      {tab === "manual" && <ManualImport />}
      {tab === "sync" && <SyncSources />}
      {tab === "history" && <History onErrors={(id) => { setErrBatch(id); setTab("errors"); }} />}
      {tab === "errors" && <ErrorLog batchId={errBatch} onClear={() => setErrBatch(null)} />}
    </>
  );
}

/* ---------------- Manual ---------------- */
function ManualImport() {
  const store = useStore();
  const { db } = store;
  const act = useAction();
  const toast = useToast();
  const [scope, setScope] = useState<ImportScope>({ month: todayBangkok().slice(0, 7), platform: "SHOPEE", shopId: "ALL" });
  const [mode, setMode] = useState<"url" | "paste">("url");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ v: ValidationResult; diff: Diff; hash: string; outside: number; scope: ImportScope; source: string } | null>(null);
  const [confirming, setConfirming] = useState(false);

  const shops = db.shops.filter((s) => s.platform === scope.platform);
  const setS = (p: Partial<ImportScope>) => { setScope((s) => ({ ...s, ...p })); setResult(null); };

  async function validate() {
    let csv = text;
    let source = "วาง CSV / ไฟล์";
    setLoading(true);
    try {
      if (mode === "url") {
        if (!url.trim()) throw new Error("กรุณาวางลิงก์ Google Sheets");
        csv = await fetchSheetCsv(url.trim());
        setText(csv);
        source = url.trim();
      }
      if (!csv.trim()) throw new Error("ยังไม่มีข้อมูล CSV");
      const hash = await contentHash(csv);
      const importRef = `imp_${hash.slice(0, 8)}_${scope.month.replace("-", "")}`;
      const v = validateRows(csv, { shops: db.shops, members: db.members, scope, source: mode === "url" ? "gsheet:manual" : "csv:manual", importRef, now: new Date().toISOString() });
      const diff = diffScope(db.schedules, v.rows, scope);
      const outside = db.schedules.filter((s) => !inScope(s, scope)).length;
      setResult({ v, diff, hash, outside, scope, source });
      if (v.errors.length) {
        const last = db.imports.find((b) => b.status === "REJECTED");
        if (!(last && last.hash === hash && JSON.stringify(last.scope) === JSON.stringify(scope)))
          store.rejectImport({ scope, hash, trigger: "MANUAL", sourceName: source, rowCount: v.totalRows, errors: v.errors });
      }
    } catch (e) {
      toast("danger", e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function confirmReplace() {
    if (!result || result.v.errors.length) return;
    const { diff } = result;
    const b = act(() => store.applyImport({ scope: result.scope, rows: result.v.rows, hash: result.hash, trigger: "MANUAL", sourceName: result.source, rowCount: result.v.totalRows }),
      `นำเข้าสำเร็จ: +${diff.added.length} −${diff.removed.length} (สำรองข้อมูลเดิมแล้ว)`);
    if (b) { setResult(null); setText(""); setConfirming(false); }
  }

  function downloadTemplate() {
    const sample = shops[0]?.name ?? "ชื่อร้าน";
    const host = db.members.find((m) => m.isHost)?.name ?? "ชื่อ Host";
    const csv = `${TEMPLATE_HEADER}\n${scope.month}-01,09:00,11:00,${scope.platform === "SHOPEE" ? "Shopee" : "TikTok"},${sample},${host},scheduled\n`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = "live-schedule-template.csv";
    a.click();
  }

  const noChange = result && !result.v.errors.length && result.diff.added.length + result.diff.removed.length + result.diff.changed.length === 0;

  return (
    <div className="ox-steps">
      <div className="ox-step">
        <div>
          <div className="ox-step__title">เลือก Scope ที่จะ Replace</div>
          <p className="ox-xs ox-muted" style={{ marginBottom: 8 }}>ระบบจะแทนที่เฉพาะข้อมูลที่ตรงทั้ง เดือน + Platform + Shop นี้ ข้อมูลอื่นไม่ถูกแตะ</p>
          <div className="ox-filter-bar">
            <label className="ls-filter-field"><span className="ox-label">เดือน</span><input type="month" className="ox-control" value={scope.month} onChange={(e) => e.target.value && setS({ month: e.target.value })} /></label>
            <label className="ls-filter-field"><span className="ox-label">Platform</span>
              <select className="ox-control" value={scope.platform} onChange={(e) => setS({ platform: e.target.value as PlatformCode, shopId: "ALL" })}>
                {PLATFORMS.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
              </select>
            </label>
            <label className="ls-filter-field"><span className="ox-label">Shop</span>
              <select className="ox-control" value={scope.shopId} onChange={(e) => setS({ shopId: e.target.value })}>
                <option value="ALL">ทุกร้านใน {scope.platform === "SHOPEE" ? "Shopee" : "TikTok"} ({shops.length})</option>
                {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          </div>
          <ScopeCard scope={scope} current={db.schedules.filter((s) => inScope(s, scope)).length} />
        </div>
      </div>

      <div className="ox-step">
        <div className="ox-stack">
          <div className="ox-step__title">ระบุแหล่งข้อมูล</div>
          <div className="ox-row">
            <Segment<"url" | "paste"> label="แหล่งข้อมูล" value={mode} onChange={(m) => { setMode(m); setResult(null); }} options={[{ value: "url", label: "ลิงก์ Google Sheets" }, { value: "paste", label: "วาง CSV / อัปโหลดไฟล์" }]} />
            <Button variant="ghost" size="sm" onClick={downloadTemplate}><Download size={14} />ดาวน์โหลดแม่แบบ CSV</Button>
          </div>
          {mode === "url" ? (
            <Field label="ลิงก์ Google Sheets" htmlFor="sheet-url" help="แชร์ชีตแบบ “ทุกคนที่มีลิงก์ดูได้” หรือ ไฟล์ → แชร์ → เผยแพร่ไปยังเว็บ → CSV · รองรับลิงก์ /edit#gid=… (แปลงเป็น CSV ให้อัตโนมัติ)">
              <input id="sheet-url" className="ox-control" placeholder="https://docs.google.com/spreadsheets/d/…/edit#gid=0" value={url} onChange={(e) => { setUrl(e.target.value); setResult(null); }} />
            </Field>
          ) : (
            <>
              <Field label="ข้อมูล CSV" htmlFor="csv" help={<>หัวตาราง: <code>{TEMPLATE_HEADER}</code> · วันที่ YYYY-MM-DD หรือ DD/MM/YYYY (รองรับ พ.ศ.) · Platform: Shopee / TikTok</>}>
                <textarea id="csv" className="ox-control ls-mono" rows={8} value={text} onChange={(e) => { setText(e.target.value); setResult(null); }} placeholder={TEMPLATE_HEADER} />
              </Field>
              <input type="file" accept=".csv,text/csv" aria-label="อัปโหลดไฟล์ CSV" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setText(await f.text()); setResult(null); } }} />
            </>
          )}
          <div><Button variant="primary" onClick={validate} disabled={loading}>{loading ? "กำลังตรวจสอบ…" : "ตรวจสอบและดูตัวอย่าง"}</Button></div>
        </div>
      </div>

      <div className="ox-step">
        <div className="ox-stack" style={{ minWidth: 0 }}>
          <div className="ox-step__title">ตรวจสอบ Preview แล้วยืนยัน</div>
          {!result ? <p className="ox-muted ox-xs">ผลการตรวจสอบจะแสดงที่นี่</p> : <Preview r={result} />}
          {result && (
            result.v.errors.length ? (
              <div className="ox-alert ox-alert--danger">Validation ไม่ผ่าน {result.v.errors.length} รายการ — ระบบจะไม่ Replace และเก็บข้อมูลเดิมไว้ทั้งหมด (บันทึกใน Error Log แล้ว) แก้ไขในชีตแล้วตรวจสอบใหม่</div>
            ) : noChange ? (
              <div className="ox-alert ox-alert--info">ข้อมูลตรงกับที่มีอยู่แล้วทั้งหมด ไม่มีอะไรต้องเปลี่ยน</div>
            ) : (
              <div className="ox-row">
                <Button variant="primary" onClick={() => setConfirming(true)}>ตรวจทาน Scope และยืนยัน Replace…</Button>
                <Button variant="ghost" onClick={() => setResult(null)}>ยกเลิก</Button>
              </div>
            )
          )}
        </div>
      </div>
      {confirming && result && (
        <ConfirmReplace scope={result.scope} diff={result.diff} outside={result.outside} current={db.schedules.filter((s) => inScope(s, result.scope)).length}
          source={result.source} onClose={() => setConfirming(false)} onConfirm={confirmReplace} />
      )}
    </div>
  );
}

/** แสดง Scope ที่จะถูกแทนที่ให้ชัด: เดือน · Platform · ร้าน (รายชื่อจริง) · จำนวนแถวปัจจุบัน */
function ScopeCard({ scope, current, compact }: { scope: ImportScope; current: number; compact?: boolean }) {
  const { db } = useStore();
  const shops = scope.shopId === "ALL" ? db.shops.filter((s) => s.platform === scope.platform) : db.shops.filter((s) => s.id === scope.shopId);
  const [y, m] = scope.month.split("-").map(Number);
  const monthName = new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric", timeZone: "Asia/Bangkok" }).format(new Date(Date.UTC(y, m - 1, 15)));
  return (
    <div className={`ls-scope pf-${scope.platform}${compact ? " is-compact" : ""}`} aria-label="ขอบเขตที่จะถูกแทนที่">
      <div className="ls-scope__item"><span className="ls-scope__k">เดือน</span><span className="ls-scope__v">{monthName}</span></div>
      <div className="ls-scope__item"><span className="ls-scope__k">Platform</span><span className="ls-scope__v"><PlatformBadge platform={scope.platform} /></span></div>
      <div className="ls-scope__item ls-scope__shops"><span className="ls-scope__k">ร้าน {scope.shopId === "ALL" ? `(ทุกร้าน ${shops.length})` : ""}</span><span className="ls-scope__v">{shops.map((s) => <span key={s.id} className="ox-badge">{s.name}</span>)}{!shops.length && <span className="ox-muted">ยังไม่มีร้าน</span>}</span></div>
      <div className="ls-scope__item"><span className="ls-scope__k">ข้อมูลเดิมใน Scope</span><span className="ls-scope__v ox-num">{current.toLocaleString("th-TH")} รายการ</span></div>
    </div>
  );
}

function ConfirmReplace({ scope, diff, outside, current, source, onClose, onConfirm }: { scope: ImportScope; diff: Diff; outside: number; current: number; source: string; onClose: () => void; onConfirm: () => void }) {
  const [ack, setAck] = useState(false);
  return (
    <Modal title="ยืนยันการแทนที่ข้อมูล (Replace)" onClose={onClose} foot={<>
      <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
      <Button variant="danger" disabled={!ack} onClick={onConfirm}>แทนที่ข้อมูลใน Scope นี้</Button>
    </>}>
      <p>ข้อมูลตารางไลฟ์ <strong>ทั้งหมด</strong> ในขอบเขตด้านล่างจะถูกแทนที่ด้วยข้อมูลจากแหล่งที่ตรวจสอบแล้ว</p>
      <ScopeCard scope={scope} current={current} compact />
      <div className="ls-stat-row">
        <Stat label="จะเพิ่ม" v={diff.added.length} />
        <Stat label="จะลบ" v={diff.removed.length} tone={diff.removed.length ? "warning" : undefined} />
        <Stat label="คงเดิม/อัปเดต" v={diff.unchanged.length + diff.changed.length} />
        <Stat label="นอก Scope (ไม่แตะ)" v={outside} />
      </div>
      <p className="ox-xs ox-muted">แหล่งข้อมูล: <span className="ls-mono" style={{ overflowWrap: "anywhere" }}>{source}</span> · ระบบสำรองข้อมูลเดิมไว้ ย้อนกลับได้ที่แท็บ “ประวัติการนำเข้า”</p>
      <label className="ox-check"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> ฉันตรวจสอบแล้วว่า Platform ร้าน และเดือนถูกต้อง</label>
    </Modal>
  );
}

function Preview({ r }: { r: { v: ValidationResult; diff: Diff; outside: number } }) {
  const { shopsById, membersById } = useStore();
  const [showAll, setShowAll] = useState(false);
  const rows = [...r.v.rows].sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  const added = new Set(r.diff.added.map((s) => s.id));
  return (
    <>
      <div className="ls-stat-row">
        <Stat label="แถวในไฟล์" v={r.v.totalRows} />
        <Stat label="ผ่าน" v={r.v.rows.length} />
        <Stat label="Error" v={r.v.errors.length} tone={r.v.errors.length ? "danger" : undefined} />
        <Stat label="คำเตือน" v={r.v.warnings.length} tone={r.v.warnings.length ? "warning" : undefined} />
        <Stat label="จะเพิ่ม" v={r.diff.added.length} />
        <Stat label="จะลบ" v={r.diff.removed.length} />
        <Stat label="คงเดิม/อัปเดต" v={r.diff.unchanged.length + r.diff.changed.length} />
        <Stat label="นอก Scope (ไม่แตะ)" v={r.outside} />
      </div>
      {r.v.errors.length > 0 && <IssueTable title="รายการ Error" items={r.v.errors} tone="danger" />}
      {r.v.warnings.length > 0 && <IssueTable title="คำเตือน (ไม่บล็อกการนำเข้า)" items={r.v.warnings} tone="warning" />}
      {r.diff.removed.length > 0 && <div className="ox-alert ox-alert--warning">จะลบ {r.diff.removed.length} รายการที่ไม่มีในชีตแล้ว (ใน Scope นี้เท่านั้น)</div>}
      {rows.length > 0 && (
        <div className="ox-table-wrap ls-scroll">
          <table className="ox-table ox-table--data">
            <thead><tr><th>วันที่</th><th>เวลา</th><th>Shop</th><th>Host</th><th>สถานะ</th><th>การเปลี่ยนแปลง</th></tr></thead>
            <tbody>
              {(showAll ? rows : rows.slice(0, 100)).map((s) => (
                <tr key={s.id}>
                  <td className="ox-num">{s.date}</td><td className="ox-num">{s.startTime}–{s.endTime}</td>
                  <td>{shopsById.get(s.shopId)?.name}</td><td>{membersById.get(s.hostId)?.name}</td><td>{s.status}</td>
                  <td>{added.has(s.id) ? <span className="ox-badge ox-badge--success">เพิ่มใหม่</span> : <span className="ox-badge">มีอยู่แล้ว</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 100 && <div><Button size="sm" variant="ghost" onClick={() => setShowAll(!showAll)}>{showAll ? "แสดง 100 แถวแรก" : `แสดงทั้งหมด ${rows.length} แถว`}</Button></div>}
    </>
  );
}

function Stat({ label, v, tone }: { label: string; v: number; tone?: "danger" | "warning" }) {
  return <div className="ls-stat"><div className="ox-xs ox-muted">{label}</div><div className="ls-stat__v" style={tone ? { color: `var(--omnix-${tone}-fg)` } : undefined}>{v.toLocaleString("th-TH")}</div></div>;
}

function IssueTable({ title, items, tone }: { title: string; items: { row: number; field: string; message: string }[]; tone: "danger" | "warning" }) {
  return (
    <div className="ox-stack" style={{ gap: 6 }}>
      <strong style={{ color: `var(--omnix-${tone}-fg)` }}>{title} ({items.length})</strong>
      <div className="ox-table-wrap ls-scroll" style={{ maxHeight: 260 }}>
        <table className="ox-table ox-table--data">
          <thead><tr><th className="is-num">แถว</th><th>คอลัมน์</th><th>รายละเอียด</th></tr></thead>
          <tbody>{items.map((e, i) => <tr key={i}><td className="is-num">{e.row || "—"}</td><td className="ls-mono">{e.field}</td><td>{e.message}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- Auto Sync ---------------- */
function SyncSources() {
  const store = useStore();
  const { db, saveSettings, deleteSource, saveSource, shopsById } = store;
  const act = useAction();
  const toast = useToast();
  const [edit, setEdit] = useState<Partial<SyncSource> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function syncNow(src: SyncSource) {
    setBusy(src.id);
    try {
      const r = await runSync(store, src, "MANUAL");
      toast(r.status === "APPLIED" || r.status === "SKIPPED" ? "success" : "danger", `${src.name}: ${r.message}`);
    } catch (e) { toast("danger", e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }

  return (
    <>
      <div className="ox-card"><div className="ox-card__body">
        <div className="ox-row" style={{ justifyContent: "space-between" }}>
          <Toggle checked={db.settings.autoSyncEnabled} onChange={(v) => act(() => saveSettings({ autoSyncEnabled: v }), v ? "เปิด Auto Sync แล้ว" : "ปิด Auto Sync แล้ว")} label={`Auto Sync ทุก ${db.settings.autoSyncIntervalMin} นาที`} />
          <Button variant="primary" onClick={() => setEdit({ name: "", csvUrl: "", platform: "SHOPEE", shopId: "ALL", enabled: true })}><Plus size={16} />เพิ่มแหล่งข้อมูล</Button>
        </div>
        <p className="ox-xs ox-muted">ทุกรอบระบบจะคำนวณ SHA-256 ของชีต ถ้าเหมือนรอบก่อนจะข้าม (ไม่นำเข้าซ้ำ) · ถ้าเปลี่ยน จะ Validate ทุกเดือนในชีตก่อน ผ่านทั้งหมดจึง Replace ทีละเดือนตาม Scope ของแหล่งข้อมูล · Phase 1 ทำงานขณะเปิดเว็บไว้ (Production ย้ายไป cron ฝั่งเซิร์ฟเวอร์)</p>
      </div></div>

      {db.sources.length === 0 ? (
        <EmptyState title="ยังไม่มีแหล่งข้อมูล Auto Sync" action={<Button variant="primary" onClick={() => setEdit({ name: "", csvUrl: "", platform: "SHOPEE", shopId: "ALL", enabled: true })}>เพิ่มแหล่งข้อมูลแรก</Button>}>
          เพิ่มลิงก์ Google Sheets ของแต่ละ Platform หรือแต่ละร้าน เพื่อให้ระบบดึงข้อมูลอัตโนมัติ
        </EmptyState>
      ) : (
        <div className="ox-table-wrap">
          <table className="ox-table">
            <thead><tr><th>แหล่งข้อมูล</th><th>Scope</th><th>Sync ล่าสุด</th><th>ผลล่าสุด</th><th style={{ width: 1 }} /></tr></thead>
            <tbody>
              {db.sources.map((s) => (
                <tr key={s.id}>
                  <td><div className="ox-row"><Sheet size={16} /><strong>{s.name}</strong>{!s.enabled && <span className="ox-badge">ปิด</span>}</div><div className="ox-xs ox-muted ls-truncate" style={{ maxWidth: 320 }}>{s.csvUrl}</div></td>
                  <td><div className="ox-row"><PlatformBadge platform={s.platform} /><span className="ox-xs">{s.shopId === "ALL" ? "ทุกร้าน" : shopsById.get(s.shopId)?.name}</span></div><div className="ox-xs ox-muted">ทุกเดือนที่อยู่ในชีต</div></td>
                  <td className="ox-xs">{fmtTs(s.lastSyncedAt)}<div className="ox-muted ls-mono">{s.lastHash ? s.lastHash.slice(0, 12) : "—"}</div></td>
                  <td className="ox-xs">{s.lastStatus ?? "—"}</td>
                  <td>
                    <div className="ox-row" style={{ flexWrap: "nowrap" }}>
                      <Button size="sm" onClick={() => syncNow(s)} disabled={busy === s.id}><Refresh size={14} />{busy === s.id ? "กำลัง Sync…" : "Sync ตอนนี้"}</Button>
                      <Button size="sm" variant="ghost" icon aria-label={`แก้ไข ${s.name}`} onClick={() => setEdit(s)}><Edit size={16} /></Button>
                      <Button size="sm" variant="ghost" icon aria-label={`ลบ ${s.name}`} onClick={() => confirm(`ลบแหล่งข้อมูล "${s.name}"? (ข้อมูลตารางที่นำเข้าแล้วไม่ถูกลบ)`) && act(() => deleteSource(s.id), "ลบแหล่งข้อมูลแล้ว")}><Trash size={16} /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && <SourceModal src={edit} onClose={() => setEdit(null)} onSave={(v) => { if (act(() => saveSource(v), "บันทึกแหล่งข้อมูลแล้ว")) setEdit(null); }} />}
    </>
  );
}

function SourceModal({ src, onClose, onSave }: { src: Partial<SyncSource>; onClose: () => void; onSave: (v: Omit<SyncSource, "id" | "lastHash" | "lastSyncedAt" | "lastStatus"> & Partial<SyncSource>) => void }) {
  const { db } = useStore();
  const [v, setV] = useState({ name: "", csvUrl: "", platform: "SHOPEE" as PlatformCode, shopId: "ALL", enabled: true, ...src });
  const shops = db.shops.filter((s) => s.platform === v.platform);
  return (
    <Modal title={src.id ? "แก้ไขแหล่งข้อมูล" : "เพิ่มแหล่งข้อมูล Auto Sync"} onClose={onClose}
      foot={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button variant="primary" onClick={() => onSave({ ...v, lastHash: src.csvUrl && src.csvUrl !== v.csvUrl ? null : src.lastHash ?? null })}>บันทึกแหล่งข้อมูล</Button></>}>
      <Field label="ชื่อแหล่งข้อมูล" required htmlFor="src-name"><input id="src-name" className="ox-control" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="เช่น ตาราง Shopee ประจำเดือน" /></Field>
      <Field label="ลิงก์ Google Sheets" required htmlFor="src-url" help="ลิงก์ /edit#gid=… หรือลิงก์ที่เผยแพร่เป็น CSV"><input id="src-url" className="ox-control" value={v.csvUrl} onChange={(e) => setV({ ...v, csvUrl: e.target.value })} /></Field>
      <div className="ls-two-col">
        <Field label="Platform (Scope)" htmlFor="src-pf">
          <select id="src-pf" className="ox-control" value={v.platform} onChange={(e) => setV({ ...v, platform: e.target.value as PlatformCode, shopId: "ALL" })}>{PLATFORMS.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</select>
        </Field>
        <Field label="Shop (Scope)" htmlFor="src-shop">
          <select id="src-shop" className="ox-control" value={v.shopId} onChange={(e) => setV({ ...v, shopId: e.target.value })}><option value="ALL">ทุกร้าน</option>{shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </Field>
      </div>
      <Toggle checked={v.enabled} onChange={(x) => setV({ ...v, enabled: x })} label="เปิดใช้ใน Auto Sync" />
    </Modal>
  );
}

/* ---------------- History ---------------- */
const STATUS: Record<ImportBatch["status"], [string, string]> = {
  APPLIED: ["นำเข้าแล้ว", "success"], REJECTED: ["ไม่ผ่าน Validation", "danger"], SKIPPED_NO_CHANGE: ["ไม่มีการเปลี่ยนแปลง", "info"], ROLLED_BACK: ["Rollback แล้ว", "warning"],
};

function History({ onErrors }: { onErrors: (id: string) => void }) {
  const { db, rollback } = useStore();
  const act = useAction();
  if (!db.imports.length) return <EmptyState title="ยังไม่มีประวัติการนำเข้า">ประวัติจะแสดงหลังนำเข้าครั้งแรก</EmptyState>;
  return (
    <div className="ox-table-wrap">
      <table className="ox-table ox-table--data ls-nowrap">
        <thead><tr><th>เวลา</th><th>ประเภท</th><th>Scope</th><th>ผล</th><th className="is-num">แถว</th><th className="is-num">+ / − / =</th><th>Hash</th><th>ผู้ทำ</th><th style={{ width: 1 }} /></tr></thead>
        <tbody>
          {db.imports.map((b) => (
            <tr key={b.id}>
              <td className="ox-xs">{fmtTs(b.createdAt)}<div className="ox-muted ls-mono">{b.id}</div></td>
              <td>{b.trigger === "AUTO" ? <span className="ox-badge ox-badge--info">Auto</span> : <span className="ox-badge">Manual</span>}<div className="ox-xs ox-muted ls-truncate" style={{ maxWidth: 160 }}>{b.sourceName}</div></td>
              <td className="ox-xs">{scopeText(b.scope, db)}</td>
              <td><span className={`ox-badge ox-badge--${STATUS[b.status][1]}`}>{STATUS[b.status][0]}</span></td>
              <td className="is-num">{b.rowCount}</td>
              <td className="is-num">{b.status === "APPLIED" || b.status === "ROLLED_BACK" ? `+${b.added} / −${b.removed} / =${b.unchanged}` : "—"}</td>
              <td className="ls-mono ox-muted">{b.hash.slice(0, 10)}</td>
              <td className="ox-xs">{b.actor}</td>
              <td>
                {b.status === "APPLIED" && b.backup && <Button size="sm" variant="danger" onClick={() => confirm(`Rollback ${b.id}?\nข้อมูลใน Scope ${scopeText(b.scope, db)} จะกลับไปเป็นข้อมูลสำรองก่อนนำเข้า (${b.backup!.length} รายการ)`) && act(() => rollback(b.id), "Rollback สำเร็จ")}><Undo size={14} />Rollback</Button>}
                {b.status === "REJECTED" && <Button size="sm" variant="ghost" onClick={() => onErrors(b.id)}>ดู Error ({b.errorCount})</Button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ErrorLog({ batchId, onClear }: { batchId: string | null; onClear: () => void }) {
  const { db } = useStore();
  const list = useMemo(() => (batchId ? db.importErrors.filter((e) => e.batchId === batchId) : db.importErrors), [db.importErrors, batchId]);
  return (
    <>
      {batchId && <div className="ox-row"><span className="ox-badge ox-badge--accent ls-mono">{batchId}</span><Button size="sm" variant="ghost" onClick={onClear}>แสดงทั้งหมด</Button></div>}
      {list.length === 0 ? <EmptyState title="ไม่มี Error">การนำเข้าที่ไม่ผ่าน Validation จะถูกบันทึกที่นี่</EmptyState> : (
        <div className="ox-table-wrap ls-scroll">
          <table className="ox-table ox-table--data">
            <thead><tr><th>เวลา</th><th>Batch</th><th className="is-num">แถว</th><th>คอลัมน์</th><th>รายละเอียด</th></tr></thead>
            <tbody>{list.slice(0, 500).map((e) => <tr key={e.id}><td className="ox-xs">{fmtTs(e.createdAt)}</td><td className="ls-mono ox-xs">{e.batchId}</td><td className="is-num">{e.row || "—"}</td><td className="ls-mono">{e.field}</td><td>{e.message}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
