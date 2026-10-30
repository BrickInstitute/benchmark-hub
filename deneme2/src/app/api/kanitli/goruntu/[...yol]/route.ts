import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { VERI_DIZINI } from "@/lib/kanitli/depo";

/**
 * Yakalama görüntüleri. Yalnız captures/<uuid>/full.jpg yayınlanır; girişin
 * arkasındadır. Yakalama değişmez → immutable önbellek (docs/09 §9).
 */
const DESEN = /^captures\/[0-9a-f-]{36}\/full\.jpg$/;

export async function GET(_istek: Request, { params }: { params: { yol: string[] } }) {
  const goreli = params.yol.join("/");
  if (!DESEN.test(goreli)) return NextResponse.json({ hata: "bulunamadı" }, { status: 404 });
  try {
    const veri = await readFile(path.join(VERI_DIZINI, goreli));
    return new NextResponse(veri, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ hata: "bulunamadı" }, { status: 404 });
  }
}
