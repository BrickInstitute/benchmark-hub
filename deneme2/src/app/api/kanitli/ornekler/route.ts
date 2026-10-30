import { NextRequest, NextResponse } from "next/server";
import { GORUNTU_ONEKI, katalogHaritasi, kohortlar } from "@/lib/kanitli/depo";
import { ornekleriGetir } from "@/lib/kanitli/rapor";

export const dynamic = "force-dynamic";

/** docs/09 §4.2 — diğer örnekler. Başka sürümden örnek gelmez. */
export async function GET(istek: NextRequest) {
  const p = istek.nextUrl.searchParams;
  const surum = p.get("benchmark_surum_id");
  const kod = p.get("criterion_kod");
  if (!surum || !kod) {
    return NextResponse.json({ hata: "benchmark_surum_id ve criterion_kod zorunlu" }, { status: 400 });
  }
  const kohort = (await kohortlar()).find((k) => k.benchmark_surumu.id === surum);
  if (!kohort) return NextResponse.json({ hata: "benchmark sürümü bulunamadı" }, { status: 404 });
  const limit = Number(p.get("limit") ?? 6);
  return NextResponse.json(
    ornekleriGetir(kohort, katalogHaritasi(kohort), {
      criterion_kod: kod,
      haric_kurum_id: p.get("haric_kurum_id"),
      deger: p.get("deger"),
      farkli_olanlar: p.get("farkli_olanlar") !== "false",
      limit: Number.isFinite(limit) ? limit : 6,
      imlec: p.get("imlec"),
      goruntuOnEki: GORUNTU_ONEKI,
    }),
    { headers: { "Cache-Control": "no-store" } },
  );
}
