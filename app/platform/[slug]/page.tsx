import { PlatformBoard } from "./PlatformBoard";

// Platform มีแค่ Shopee / TikTok → สร้างหน้าไว้ล่วงหน้า (ใช้กับเว็บแบบไฟล์ล้วนได้)
export function generateStaticParams() {
  return [{ slug: "shopee" }, { slug: "tiktok" }];
}
export const dynamicParams = false;

export default async function PlatformSchedulePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PlatformBoard slug={slug} />;
}
