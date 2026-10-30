/**
 * Kanıtlı rapor verisi — UI Benchmark Hub tarafı.
 *
 * Kaynak: benchmark-collector (scripts/hub-yayinla.ts) kohort dosyalarını ve
 * görüntüleri bu dizine yükler. Railway'de kalıcı disk (/app/data) altındadır;
 * rakip sayfa görüntüleri herkese açık repoya commit EDİLMEZ (docs/07 §3).
 *
 *   <dizin>/raporlar/<anahtar>.json             taslak kohortlar
 *   <dizin>/raporlar/surumler/<anahtar>@vN.json dondurulmuş sürümler (yazılmaz)
 *   <dizin>/captures/<uuid>/full.jpg            tam sayfa görüntüleri
 *
 * Bu dosya hub'a özgüdür; rapor kuralları src/lib/kanitli/rapor.ts'tedir ve
 * benchmark-collector'dan kopyalanır (scripts/hub-esitle.ts).
 */
import { readdir, readFile, stat } from "fs/promises";
import path from "path";
import type { KatalogOlcutu, KohortDosyasi } from "./rapor";
import { surumDurumlariniBelirle } from "./surum";

export const VERI_DIZINI =
  process.env.KANITLI_VERI_DIZINI ||
  (process.env.RAILWAY_ENVIRONMENT ? "/app/data/kanitli" : "./kanitli-veri");

export const GORUNTU_ONEKI = "/api/kanitli/goruntu/";

const onbellek = new Map<string, { mtime: number; kohort: KohortDosyasi }>();

async function dizindekiler(dizin: string): Promise<KohortDosyasi[]> {
  let dosyalar: string[] = [];
  try {
    dosyalar = (await readdir(dizin)).filter((d) => d.endsWith(".json"));
  } catch {
    return [];
  }
  const sonuc: KohortDosyasi[] = [];
  for (const d of dosyalar) {
    const yol = path.join(dizin, d);
    try {
      const m = (await stat(yol)).mtimeMs;
      const eski = onbellek.get(yol);
      if (eski && eski.mtime === m) {
        sonuc.push(eski.kohort);
        continue;
      }
      const kohort = JSON.parse(await readFile(yol, "utf8")) as KohortDosyasi;
      onbellek.set(yol, { mtime: m, kohort });
      sonuc.push(kohort);
    } catch {
      /* yarım yüklenmiş dosya; sonraki istekte yeniden denenir */
    }
  }
  return sonuc;
}

/** Taslaklar + dondurulmuş sürümler; arşiv durumu okuma anında türetilir. */
export async function kohortlar(): Promise<KohortDosyasi[]> {
  const kok = path.join(VERI_DIZINI, "raporlar");
  const hepsi = [...(await dizindekiler(kok)), ...(await dizindekiler(path.join(kok, "surumler")))];
  return surumDurumlariniBelirle(hepsi).sort(
    (a, b) => a.anahtar.localeCompare(b.anahtar) || a.benchmark_surumu.id.localeCompare(b.benchmark_surumu.id),
  );
}

export function katalogHaritasi(k: KohortDosyasi): Map<string, KatalogOlcutu> {
  return new Map((k.katalog ?? []).map((o) => [o.kod, o]));
}
