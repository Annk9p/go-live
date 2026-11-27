"use client";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import type { Member, Role } from "@/lib/types";
import { AdminOnly } from "@/components/AdminOnly";
import { Avatar, Button, Field, Modal, PageHead, Toggle, useAction } from "@/components/ui";
import { Edit, Plus, Search } from "@/components/icons";
import { durationMinutes, fmtHours, fmtMonthName, todayBangkok } from "@/lib/time";

// สีประจำตัว Host (เก็บเป็นข้อมูล) — ชุดที่แยกจากสีแพลตฟอร์ม Shopee ส้ม / TikTok ดำ
const HOST_COLORS = ["#0e9f8f", "#db2777", "#2563eb", "#d97706", "#7c3aed", "#0891b2", "#65a30d", "#e11d48", "#4f46e5", "#0d9488", "#c026d3", "#475569"];

export default function MembersPage() {
  return <AdminOnly><MembersInner /></AdminOnly>;
}

function MembersInner() {
  const { db, saveMember, me } = useStore();
  const act = useAction();
  const [edit, setEdit] = useState<Partial<Member> | null>(null);
  const [q, setQ] = useState("");
  const [role, setRole] = useState<"ALL" | Role>("ALL");
  const month = todayBangkok().slice(0, 7);
  const counts = useMemo(() => {
    const m = new Map<string, { total: number; minutes: number }>();
    for (const s of db.schedules) {
      const x = m.get(s.hostId) ?? { total: 0, minutes: 0 };
      x.total++;
      if (s.date.startsWith(month) && s.status !== "CANCELLED") x.minutes += durationMinutes(s);
      m.set(s.hostId, x);
    }
    return m;
  }, [db.schedules, month]);
  const list = db.members.filter((m) => (role === "ALL" || m.role === role) && (!q.trim() || `${m.name} ${m.nickname} ${m.email}`.toLowerCase().includes(q.trim().toLowerCase())));
  const nextColor = HOST_COLORS.find((c) => !db.members.some((m) => m.color === c)) ?? HOST_COLORS[0];

  return (
    <>
      <PageHead title="จัดการพนักงาน" desc="ตั้งสิทธิ์ Admin / Employee และกำหนดว่าใครเป็น Host พร้อมสีประจำตัว">
        <Button variant="primary" onClick={() => setEdit({ name: "", nickname: "", email: "", role: "EMPLOYEE", isHost: true, color: nextColor, active: true })}><Plus size={16} />เพิ่มพนักงาน</Button>
      </PageHead>
      <div className="ox-filter-bar" role="search">
        <label className="ls-search"><Search size={16} /><input className="ox-control" type="search" placeholder="ค้นหาชื่อ ชื่อเล่น หรืออีเมล" value={q} onChange={(e) => setQ(e.target.value)} aria-label="ค้นหาพนักงาน" /></label>
        <label className="ls-filter-field"><span className="ox-label">สิทธิ์</span>
          <select className="ox-control" value={role} onChange={(e) => setRole(e.target.value as "ALL" | Role)}><option value="ALL">ทั้งหมด</option><option value="ADMIN">Admin</option><option value="EMPLOYEE">Employee</option></select>
        </label>
        <span className="ox-filter-bar__spacer" />
        <span className="ox-filter-bar__meta ox-num">{list.length} จาก {db.members.length} คน · ชั่วโมงไลฟ์นับเฉพาะ {fmtMonthName(month)}</span>
      </div>
      <div className="ox-table-wrap">
        <table className="ox-table ox-table--data">
          <thead><tr><th>พนักงาน</th><th className="ls-hide-sm">อีเมล</th><th>สิทธิ์</th><th>Host</th><th>สถานะ</th><th className="is-num">ตารางไลฟ์</th><th className="is-num">ชั่วโมงเดือนนี้</th><th style={{ width: 1 }} /></tr></thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={8} className="ox-muted">ไม่พบพนักงานที่ตรงกับคำค้นหา</td></tr>}
            {list.map((m) => (
              <tr key={m.id}>
                <td>
                  <div className="ox-row" style={{ flexWrap: "nowrap" }}>
                    <Avatar member={m} />
                    <div style={{ minWidth: 0 }}>
                      <div>{m.name}{m.id === me.id && <span className="ox-badge ox-badge--accent" style={{ marginLeft: 6 }}>คุณ</span>}</div>
                      <div className="ox-xs ox-muted ls-mono">{m.id}</div>
                    </div>
                  </div>
                </td>
                <td className="ls-hide-sm">{m.email || "—"}</td>
                <td>{m.role === "ADMIN" ? <span className="ox-badge ox-badge--accent">Admin</span> : <span className="ox-badge">Employee</span>}</td>
                <td>{m.isHost ? <span className="ox-badge" style={{ ["--c" as string]: m.color }}>Host</span> : <span className="ox-muted">—</span>}</td>
                <td>{m.active ? <span className="ox-badge ox-badge--success">ใช้งาน</span> : <span className="ox-badge">ปิดใช้งาน</span>}</td>
                <td className="is-num">{counts.get(m.id)?.total ?? 0}</td>
                <td className="is-num">{m.isHost ? fmtHours(counts.get(m.id)?.minutes ?? 0) : "—"}</td>
                <td><Button size="sm" variant="ghost" icon aria-label={`แก้ไข ${m.name}`} onClick={() => setEdit(m)}><Edit size={16} /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && <MemberModal m={edit} onClose={() => setEdit(null)} onSave={(v) => { if (act(() => saveMember(v), `บันทึก ${v.name} แล้ว`)) setEdit(null); }} />}
    </>
  );
}

function MemberModal({ m, onClose, onSave }: { m: Partial<Member>; onClose: () => void; onSave: (v: Omit<Member, "id"> & { id?: string }) => void }) {
  const [v, setV] = useState({ name: "", nickname: "", email: "", role: "EMPLOYEE" as Role, isHost: true, color: HOST_COLORS[0], active: true, ...m });
  const [touched, setTouched] = useState(false);
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((x) => ({ ...x, [k]: val }));
  const err = touched && !v.name.trim() ? "กรุณาระบุชื่อ" : null;
  const submit = () => { setTouched(true); if (v.name.trim()) onSave(v as Omit<Member, "id"> & { id?: string }); };
  return (
    <Modal title={m.id ? "แก้ไขพนักงาน" : "เพิ่มพนักงาน"} onClose={onClose} foot={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button variant="primary" onClick={submit}>บันทึกพนักงาน</Button></>}>
      <Field label="ชื่อ (ใช้จับคู่กับคอลัมน์ host_name ในชีต)" required htmlFor="m-name" error={err}>
        <input id="m-name" className="ox-control" value={v.name} aria-invalid={!!err} onChange={(e) => set("name", e.target.value)} autoFocus />
      </Field>
      <div className="ls-two-col">
        <Field label="ชื่อเล่น" htmlFor="m-nick" help="ใช้จับคู่ host_name ได้เช่นกัน"><input id="m-nick" className="ox-control" value={v.nickname} onChange={(e) => set("nickname", e.target.value)} /></Field>
        <Field label="อีเมล (ใช้ Login ใน Phase ถัดไป)" htmlFor="m-email"><input id="m-email" type="email" className="ox-control" value={v.email} onChange={(e) => set("email", e.target.value)} /></Field>
      </div>
      <Field label="สิทธิ์" htmlFor="m-role" help="Employee ดูข้อมูลได้อย่างเดียว แก้ไข/ลบตารางไม่ได้">
        <select id="m-role" className="ox-control" value={v.role} onChange={(e) => set("role", e.target.value as Role)}>
          <option value="EMPLOYEE">Employee</option><option value="ADMIN">Admin</option>
        </select>
      </Field>
      <Toggle checked={v.isHost} onChange={(x) => set("isHost", x)} label="เป็น Host (แสดงเป็นคอลัมน์ในตาราง)" />
      {v.isHost && (
        <Field label="สีประจำตัว Host">
          <div className="ls-swatches" role="radiogroup" aria-label="สีประจำตัว">
            {HOST_COLORS.map((c) => <button key={c} type="button" role="radio" aria-checked={v.color === c} aria-label={c} className="ls-swatch" style={{ ["--c" as string]: c }} onClick={() => set("color", c)} />)}
          </div>
        </Field>
      )}
      <Toggle checked={v.active} onChange={(x) => set("active", x)} label="เปิดใช้งานบัญชี" />
    </Modal>
  );
}
