import { NextResponse } from "next/server";
import { GORUNTU_ONEKI, katalogHaritasi, kohortlar } from "@/lib/kanitli/depo";
import { raporOlustur } from "@/lib/kanitli/rapor";

export const dynamic = "force-dynamic";

/** docs/09 §4.1 — rapor gövdesi. Kimlik: "<sürüm kimliği>~<kurum kimliği>". */
export async function GET(_istek: Request, { params }: { params: { id: string } }) {
  const ham = decodeURIComponent(params.id);
  const ayrac = ham.lastIndexOf("~");
  if (ayrac < 0) return NextResponse.json({ hata: "rapor bulunamadı" }, { status: 404 });
  const surumId = ham.slice(0, ayrac);
  const kurumId = ham.slice(ayrac + 1);
  const kohort = (await kohortlar()).find((k) => k.benchmark_surumu.id === surumId);
  const govde = kohort ? raporOlustur(kohort, katalogHaritasi(kohort), kurumId, GORUNTU_ONEKI) : null;
  if (!govde) return NextResponse.json({ hata: "rapor bulunamadı" }, { status: 404 });
  return NextResponse.json(govde, { headers: { "Cache-Control": "no-store" } });
}
