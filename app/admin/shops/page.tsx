"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { PLATFORMS, type PlatformCode, type Shop } from "@/lib/types";
import { AdminOnly } from "@/components/AdminOnly";
import { Button, EmptyState, Field, Modal, PageHead, PlatformBadge, PlatformMark, SectionTitle, Segment, Toggle, useAction } from "@/components/ui";
import { todayBangkok } from "@/lib/time";
import { Edit, Plus, Search, Trash } from "@/components/icons";

export default function ShopsPage() {
  return <AdminOnly><ShopsInner /></AdminOnly>;
}

function ShopsInner() {
  const { db, saveShop, deleteShop } = useStore();
  const act = useAction();
  const [edit, setEdit] = useState<Partial<Shop> | null>(null);
  const [q, setQ] = useState("");
  const [pf, setPf] = useState<PlatformCode | "ALL">("ALL");
  const [status, setStatus] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const today = todayBangkok();
  const counts = useMemo(() => {
    const m = new Map<string, { total: number; upcoming: number }>();
    for (const s of db.schedules) {
      const x = m.get(s.shopId) ?? { total: 0, upcoming: 0 };
      x.total++;
      if (s.date >= today && s.status !== "CANCELLED") x.upcoming++;
      m.set(s.shopId, x);
    }
    return m;
  }, [db.schedules, today]);
  const match = (s: Shop) => (!q.trim() || s.name.toLowerCase().includes(q.trim().toLowerCase()) || s.id.toLowerCase().includes(q.trim().toLowerCase()))
    && (status === "ALL" || (status === "ACTIVE") === s.active);
  const filtered = q.trim() !== "" || status !== "ALL" || pf !== "ALL";

  return (
    <>
      <PageHead title="จัดการร้านค้า" desc="ร้านแยกตาม Platform — เพิ่มร้านแล้วจะแสดงใน Sidebar ใต้ Platform ที่เลือกทันที">
        <Button variant="primary" onClick={() => setEdit({ platform: pf === "ALL" ? "SHOPEE" : pf, name: "", active: true })}><Plus size={16} />เพิ่มร้าน</Button>
      </PageHead>

      <div className="ox-filter-bar" role="search">
        <label className="ls-search"><Search size={16} /><input className="ox-control" type="search" placeholder="ค้นหาชื่อร้านหรือ Shop ID" value={q} onChange={(e) => setQ(e.target.value)} aria-label="ค้นหาร้าน" /></label>
        <Segment<PlatformCode | "ALL"> label="Platform" value={pf} onChange={setPf} options={[{ value: "ALL", label: "ทุก Platform" }, ...PLATFORMS.map((p) => ({ value: p.code, label: <span className="ox-row" style={{ gap: 6 }}><PlatformMark platform={p.code} />{p.name}</span> }))]} />
        <label className="ls-filter-field"><span className="ox-label">สถานะ</span>
          <select className="ox-control" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="ALL">ทั้งหมด</option><option value="ACTIVE">ใช้งาน</option><option value="INACTIVE">ปิดใช้งาน</option>
          </select>
        </label>
        {filtered && <Button variant="ghost" size="sm" onClick={() => { setQ(""); setPf("ALL"); setStatus("ALL"); }}>ล้างตัวกรอง</Button>}
      </div>

      {PLATFORMS.filter((p) => pf === "ALL" || p.code === pf).map((p) => {
        const all = db.shops.filter((s) => s.platform === p.code).sort((a, b) => a.sortOrder - b.sortOrder);
        const shops = all.filter(match);
        return (
          <section key={p.code} className={`ox-stack ls-pf-section pf-${p.code}`}>
            <SectionTitle title={<span className="ox-row"><PlatformMark platform={p.code} />{p.name}<span className="ox-xs ox-muted ox-num">{all.filter((s) => s.active).length} ใช้งาน · {all.length} ร้าน</span></span>}>
              <Button size="sm" onClick={() => setEdit({ platform: p.code, name: "", active: true })}><Plus size={14} />เพิ่มร้าน {p.name}</Button>
            </SectionTitle>
            {all.length === 0 ? (
              <EmptyState title={`ยังไม่มีร้านใน ${p.name}`} action={<Button variant="primary" onClick={() => setEdit({ platform: p.code, name: "", active: true })}>เพิ่มร้านแรก</Button>} />
            ) : shops.length === 0 ? (
              <p className="ox-muted ox-xs">ไม่พบร้านใน {p.name} ที่ตรงกับตัวกรอง</p>
            ) : (
              <div className="ox-table-wrap">
                <table className="ox-table ls-nowrap">
                  <thead><tr><th>ชื่อร้าน</th><th>Platform</th><th className="ls-hide-sm">Shop ID</th><th>สถานะ</th><th className="is-num">ไลฟ์ที่จะถึง</th><th className="is-num ls-hide-sm">ทั้งหมด</th><th style={{ width: 1 }} /></tr></thead>
                  <tbody>
                    {shops.map((s) => {
                      const c = counts.get(s.id) ?? { total: 0, upcoming: 0 };
                      return (
                        <tr key={s.id} className={s.active ? undefined : "ls-row-off"}>
                          <td><Link href={`/shop?id=${s.id}`} style={{ fontWeight: 500 }}>{s.name}</Link></td>
                          <td><PlatformBadge platform={s.platform} /></td>
                          <td className="ls-mono ox-muted ls-hide-sm">{s.id}</td>
                          <td>
                            <label className="ox-toggle ls-switch">
                              <input type="checkbox" role="switch" checked={s.active} aria-label={`${s.active ? "ปิด" : "เปิด"}ใช้งานร้าน ${s.name}`}
                                onChange={(e) => act(() => saveShop({ ...s, active: e.target.checked }), e.target.checked ? `เปิดใช้งาน ${s.name} แล้ว` : `ปิดใช้งาน ${s.name} แล้ว — พนักงานจะไม่เห็นร้านนี้`)} />
                              <span className="ox-toggle__track" /><span className={s.active ? "ls-on" : "ox-muted"}>{s.active ? "ใช้งาน" : "ปิดใช้งาน"}</span>
                            </label>
                          </td>
                          <td className="is-num">{c.upcoming}</td>
                          <td className="is-num ox-muted ls-hide-sm">{c.total}</td>
                          <td>
                            <div className="ox-row" style={{ flexWrap: "nowrap" }}>
                              <Button size="sm" variant="ghost" icon aria-label={`แก้ไข ${s.name}`} onClick={() => setEdit(s)}><Edit size={16} /></Button>
                              <Button size="sm" variant="ghost" icon aria-label={`ลบ ${s.name}`} disabled={c.total > 0} title={c.total > 0 ? "มีตารางไลฟ์อยู่ ใช้ปิดใช้งานแทน" : "ลบร้าน"}
                                onClick={() => confirm(`ลบร้าน "${s.name}"? การลบย้อนกลับไม่ได้`) && act(() => deleteShop(s.id), `ลบร้าน ${s.name} แล้ว`)}><Trash size={16} /></Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}

      {edit && <ShopModal shop={edit} onClose={() => setEdit(null)} onSave={(s) => { if (act(() => saveShop(s), s.id ? `บันทึกร้าน ${s.name} แล้ว` : `เพิ่มร้าน ${s.name} แล้ว — แสดงใน Sidebar แล้ว`)) setEdit(null); }} />}
    </>
  );
}

function ShopModal({ shop, onClose, onSave }: { shop: Partial<Shop>; onClose: () => void; onSave: (s: Pick<Shop, "platform" | "name"> & Partial<Shop>) => void }) {
  const [platform, setPlatform] = useState<PlatformCode>(shop.platform ?? "SHOPEE");
  const [name, setName] = useState(shop.name ?? "");
  const [active, setActive] = useState(shop.active ?? true);
  const [touched, setTouched] = useState(false);
  const err = touched && !name.trim() ? "กรุณาระบุชื่อร้าน" : null;
  const submit = () => { setTouched(true); if (name.trim()) onSave({ ...shop, platform, name, active }); };
  return (
    <Modal title={shop.id ? "แก้ไขร้าน" : "เพิ่มร้าน"} onClose={onClose} foot={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button variant="primary" onClick={submit}>{shop.id ? "บันทึกร้าน" : "เพิ่มร้าน"}</Button></>}>
      <Field label="Platform" required htmlFor="shop-pf" help="ร้านต้องสังกัด Platform เดียว (Shopee หรือ TikTok)">
        <select id="shop-pf" className="ox-control" value={platform} onChange={(e) => setPlatform(e.target.value as PlatformCode)}>
          {PLATFORMS.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
        </select>
      </Field>
      <Field label="ชื่อร้าน" required htmlFor="shop-name" error={err} help="ต้องตรงกับชื่อร้านในคอลัมน์ shop_name ของ Google Sheets">
        <input id="shop-name" className="ox-control" value={name} aria-invalid={!!err} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
      </Field>
      <Toggle checked={active} onChange={setActive} label="เปิดใช้งาน (แสดงให้พนักงานเห็น)" />
    </Modal>
  );
}
