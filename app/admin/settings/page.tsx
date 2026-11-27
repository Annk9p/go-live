"use client";
import { useStore } from "@/lib/store";
import { fmtTs } from "@/lib/time";
import { AdminOnly } from "@/components/AdminOnly";
import { Button, Card, Field, PageHead, SectionTitle, Toggle, useAction } from "@/components/ui";

export default function SettingsPage() {
  return <AdminOnly><Settings /></AdminOnly>;
}

function Settings() {
  const { db, saveSettings, clearDemo, resetDemo, hasDemo } = useStore();
  const act = useAction();
  const s = db.settings;
  const hours = Array.from({ length: 25 }, (_, i) => i);
  return (
    <>
      <PageHead title="ตั้งค่าระบบ" desc="การซิงก์ สิทธิ์การมองเห็น การแสดงผล และบันทึกการใช้งาน (Audit Log)" />
      <div className="ls-two-col">
        <Card>
          <SectionTitle title="การซิงก์ข้อมูล" />
          <Toggle checked={s.autoSyncEnabled} onChange={(v) => act(() => saveSettings({ autoSyncEnabled: v }), "บันทึกการตั้งค่าแล้ว")} label="เปิด Auto Sync จาก Google Sheets" />
          <Field label="รอบการซิงก์" htmlFor="st-int" help="ค่ามาตรฐานตามข้อกำหนด: ทุก 30 นาที">
            <select id="st-int" className="ox-control" value={s.autoSyncIntervalMin} onChange={(e) => act(() => saveSettings({ autoSyncIntervalMin: +e.target.value }), "บันทึกการตั้งค่าแล้ว")}>
              {[15, 30, 60].map((m) => <option key={m} value={m}>ทุก {m} นาที</option>)}
            </select>
          </Field>
          <p className="ox-xs ox-muted">Timezone ของระบบ: <strong>Asia/Bangkok</strong> (คงที่)</p>
        </Card>
        <Card>
          <SectionTitle title="สิทธิ์การมองเห็นของ Employee" />
          <Field label="ตารางไลฟ์ทีม" htmlFor="st-vis" help="Employee อ่านได้อย่างเดียวเสมอ แก้ไขหรือลบตารางไม่ได้">
            <select id="st-vis" className="ox-control" value={s.employeeTeamView} onChange={(e) => act(() => saveSettings({ employeeTeamView: e.target.value as "ALL" | "OWN_SHOPS" }), "บันทึกการตั้งค่าแล้ว")}>
              <option value="ALL">เห็นตารางของทั้งทีม</option>
              <option value="OWN_SHOPS">เห็นเฉพาะร้านที่ตัวเองมีตารางไลฟ์</option>
            </select>
          </Field>
          <SectionTitle title="การแสดงผลตาราง" />
          <div className="ls-two-col">
            <Field label="เริ่มแสดงตั้งแต่" htmlFor="st-start">
              <select id="st-start" className="ox-control" value={s.dayStartHour} onChange={(e) => act(() => saveSettings({ dayStartHour: Math.min(+e.target.value, s.dayEndHour - 1) }), "บันทึกการตั้งค่าแล้ว")}>
                {hours.slice(0, 24).map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
              </select>
            </Field>
            <Field label="แสดงถึง" htmlFor="st-end">
              <select id="st-end" className="ox-control" value={s.dayEndHour} onChange={(e) => act(() => saveSettings({ dayEndHour: Math.max(+e.target.value, s.dayStartHour + 1) }), "บันทึกการตั้งค่าแล้ว")}>
                {hours.slice(1).map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
              </select>
            </Field>
          </div>
        </Card>
      </div>

      <Card>
        <SectionTitle title="ข้อมูลตัวอย่าง (Mock Data)" />
        {db.published ? (
          <div className="ox-alert ox-alert--success">ตอนนี้ใช้ข้อมูลจริงจาก Google Sheets “{db.published.source.title}” (ซิงก์ล่าสุด {fmtTs(db.published.generatedAt)}) — ไม่มีข้อมูลตัวอย่าง</div>
        ) : hasDemo ? (
          <div className="ox-alert ox-alert--warning">ขณะนี้มีข้อมูลตัวอย่างสำหรับทดสอบ UI (พนักงานและตารางไลฟ์ที่ขึ้นต้นด้วย “Demo”) — ห้ามใช้เป็นข้อมูลจริง ล้างทิ้งก่อนเริ่มนำเข้าข้อมูลจริง · ร้านค้า (EloopTH, MoovTH, EloopPB) เป็นร้านจริงและจะไม่ถูกลบ</div>
        ) : <p className="ox-muted">ไม่มีข้อมูลตัวอย่างในระบบ</p>}
        {!db.published && <div className="ox-row">
          <Button variant="danger" disabled={!hasDemo} onClick={() => confirm("ล้างข้อมูลตัวอย่างทั้งหมด? (บัญชีที่กำลังใช้งานจะถูกเก็บไว้) การล้างย้อนกลับไม่ได้") && act(clearDemo, "ล้างข้อมูลตัวอย่างแล้ว")}>ล้างข้อมูลตัวอย่าง</Button>
          <Button variant="ghost" onClick={() => confirm("รีเซ็ตทั้งระบบกลับเป็นข้อมูลตัวอย่าง? ตารางที่นำเข้า พนักงาน และประวัติทั้งหมดจะหายไป (ร้านค้าจะยังอยู่)") && act(resetDemo, "รีเซ็ตเป็นข้อมูลตัวอย่างแล้ว")}>รีเซ็ตเป็นข้อมูลตัวอย่าง</Button>
        </div>}
      </Card>

      <section className="ox-stack">
        <SectionTitle title={`บันทึกการใช้งาน (Audit Log) · ${db.audit.length} รายการล่าสุด`} />
        <div className="ox-table-wrap ls-scroll">
          <table className="ox-table ox-table--data">
            <thead><tr><th>เวลา</th><th>ผู้ทำ</th><th>การกระทำ</th><th>รายละเอียด</th></tr></thead>
            <tbody>{db.audit.slice(0, 200).map((a) => <tr key={a.id}><td className="ox-xs">{fmtTs(a.at)}</td><td>{a.actor}</td><td className="ls-mono">{a.action}</td><td className="ox-xs">{a.detail}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
    </>
  );
}
