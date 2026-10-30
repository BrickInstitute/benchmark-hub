import { NextResponse } from "next/server";
import { kohortlar } from "@/lib/kanitli/depo";
import type { RaporListesiOgesi } from "@/lib/kanitli/rapor-sozlesmesi";

export const dynamic = "force-dynamic";

/** docs/09 §4 — rapor listesi. Girişin arkasındadır (middleware). */
export async function GET() {
  const raporlar: RaporListesiOgesi[] = (await kohortlar()).flatMap((k) =>
    k.kayitlar
      .filter((x) => x.capture_id)
      .map((x) => ({
        id: `${k.benchmark_surumu.id}~${x.kurum_id}`,
        surum: k.benchmark_surumu.surum,
        surum_durumu: k.benchmark_surumu.durum,
        kurum: x.kurum,
        sektor: k.sektor_ad,
        viewport: k.viewport,
        url: x.url,
        kalite_gecti: x.kalite_gecti,
      })),
  );
  return NextResponse.json({ raporlar }, { headers: { "Cache-Control": "no-store" } });
}
