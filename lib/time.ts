// เวลาทั้งหมดในระบบเป็น Asia/Bangkok (UTC+7, ไม่มี DST)
// เก็บวันที่เป็น "YYYY-MM-DD" และเวลาเป็น "HH:mm" แล้วแปลงเป็นนาทีสัมบูรณ์เพื่อคำนวณ

export const TZ = "Asia/Bangkok";

/** วันที่วันนี้ตามเวลากรุงเทพฯ */
export function todayBangkok(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function nowBangkokMinutes(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
  return toMinutes(parts);
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function fromMinutes(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** จำนวนวันนับจาก epoch ของวันที่ (ไม่ขึ้นกับ timezone ของเครื่อง) */
export function dayIndex(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

export function fromDayIndex(idx: number): string {
  return new Date(idx * 86_400_000).toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
  return fromDayIndex(dayIndex(date) + n);
}

/** ช่วงเวลาเป็นนาทีสัมบูรณ์ [start, end) — end ≤ start ถือว่าข้ามเที่ยงคืน */
export function absInterval(s: { date: string; startTime: string; endTime: string }): [number, number] {
  const base = dayIndex(s.date) * 1440;
  const start = base + toMinutes(s.startTime);
  let end = base + toMinutes(s.endTime);
  if (end <= start) end += 1440;
  return [start, end];
}

export function durationMinutes(s: { date: string; startTime: string; endTime: string }): number {
  const [a, b] = absInterval(s);
  return b - a;
}

/** วันจันทร์ของสัปดาห์ */
export function startOfWeek(date: string): string {
  const idx = dayIndex(date);
  const dow = (new Date(idx * 86_400_000).getUTCDay() + 6) % 7; // จันทร์ = 0
  return fromDayIndex(idx - dow);
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

const fmtDayMonth = new Intl.DateTimeFormat("th-TH-u-ca-gregory", { day: "numeric", month: "short", timeZone: "UTC" });
const fmtFull = new Intl.DateTimeFormat("th-TH-u-ca-gregory", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const fmtWeekday = new Intl.DateTimeFormat("th-TH-u-ca-gregory", { weekday: "short", timeZone: "UTC" });
const fmtWeekdayLong = new Intl.DateTimeFormat("th-TH-u-ca-gregory", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const fmtMonth = new Intl.DateTimeFormat("th-TH-u-ca-gregory", { month: "long", year: "numeric", timeZone: "UTC" });
const fmtDateTime = new Intl.DateTimeFormat("th-TH-u-ca-gregory", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TZ });

const asDate = (date: string) => new Date(dayIndex(date) * 86_400_000);
export const fmtD = (date: string) => fmtDayMonth.format(asDate(date));
export const fmtDY = (date: string) => fmtFull.format(asDate(date));
export const fmtWd = (date: string) => fmtWeekday.format(asDate(date));
export const fmtLong = (date: string) => fmtWeekdayLong.format(asDate(date));
export const fmtMonthName = (month: string) => fmtMonth.format(asDate(`${month}-01`));
export const fmtTs = (iso: string | null | undefined) => (iso ? fmtDateTime.format(new Date(iso)) : "—");
export const fmtHours = (min: number) => {
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} ชม. ${m} นาที` : `${h} ชม.`;
};
