import { NextRequest, NextResponse } from "next/server";
import { access, mkdir, rename, writeFile } from "fs/promises";
import path from "path";
import { VERI_DIZINI } from "@/lib/kanitli/depo";

/**
 * Yayın paketi yükleme (benchmark-collector → hub kalıcı diski).
 *
 * Oturum değil anahtar ister: scripts/hub-yayinla.ts komut satırından çağırır.
 * Middleware bu yolu oturumsuz geçirir (isPublicPath); koruma buradadır.
 * KANITLI_YUKLEME_ANAHTARI tanımlı değilse uç kapalıdır.
 *
 * Yalnız bilinen biçimdeki yollar yazılabilir; dondurulmuş sürüm dosyası
 * (surumler/) bir kez yazılır, üzerine yazılamaz (docs/00).
 */
const YOLLAR = [
  /^raporlar\/[a-z0-9-]+\.json$/,
  /^raporlar\/surumler\/[a-z0-9-]+@v\d+\.json$/,
  /^captures\/[0-9a-f-]{36}\/full\.jpg$/,
];
const AZAMI_BAYT = 25 * 1024 * 1024;

function ayniMi(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let fark = 0;
  for (let i = 0; i < a.length; i++) fark |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return fark === 0;
}

export async function PUT(istek: NextRequest) {
  const anahtar = process.env.KANITLI_YUKLEME_ANAHTARI;
  if (!anahtar) return NextResponse.json({ hata: "yükleme kapalı" }, { status: 503 });
  const verilen = (istek.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!ayniMi(verilen, anahtar)) return NextResponse.json({ hata: "yetkisiz" }, { status: 401 });

  const goreli = istek.nextUrl.searchParams.get("yol") ?? "";
  if (!YOLLAR.some((d) => d.test(goreli))) {
    return NextResponse.json({ hata: "izin verilmeyen yol" }, { status: 400 });
  }
  const hedef = path.join(VERI_DIZINI, goreli);
  if (goreli.startsWith("raporlar/surumler/")) {
    try {
      await access(hedef);
      return NextResponse.json({ hata: "dondurulmuş sürüm yeniden yazılmaz" }, { status: 409 });
    } catch {
      /* yok — yazılabilir */
    }
  }
  const veri = Buffer.from(await istek.arrayBuffer());
  if (veri.length === 0 || veri.length > AZAMI_BAYT) {
    return NextResponse.json({ hata: "boyut geçersiz" }, { status: 413 });
  }
  if (goreli.endsWith(".json")) {
    try {
      JSON.parse(veri.toString("utf8"));
    } catch {
      return NextResponse.json({ hata: "geçersiz JSON" }, { status: 400 });
    }
  }
  await mkdir(path.dirname(hedef), { recursive: true });
  // Yarım dosya okunmasın: önce geçici dosyaya, sonra yerine.
  const gecici = `${hedef}.${process.pid}.yukleniyor`;
  await writeFile(gecici, veri);
  await rename(gecici, hedef);
  return NextResponse.json({ yazildi: goreli, bayt: veri.length });
}
