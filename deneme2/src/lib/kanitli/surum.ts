// OTOMATİK KOPYA — benchmark-collector/src/lib/surum.ts (scripts/hub-esitle.ts). Burada düzenlemeyin.
/**
 * Benchmark sürümleri (docs/00 "Benchmark sürümü", docs/09 §8).
 *
 * "Yayınlanmış bir rapor asla sessizce değişmez." Bu yüzden:
 *   - Dondurulan sürüm dosyası (storage/raporlar/surumler/<anahtar>@<sürüm>.json)
 *     bir daha YAZILMAZ.
 *   - "arşiv" durumu dosyaya yazılmaz, okuma anında türetilir: aynı kohortun
 *     daha yeni bir dondurulmuş sürümü varsa eskisi arşivdir. Böylece yeni
 *     sürüm dondurmak eski dosyaya dokunmaz.
 *
 * Veritabanında karşılığı `benchmark_versions` + `benchmark_members`.
 */
import type { KohortDosyasi } from './rapor';

/** Sürüm dosyalarının durumunu türetir; taslaklar olduğu gibi kalır. */
export function surumDurumlariniBelirle(kohortlar: KohortDosyasi[]): KohortDosyasi[] {
  const enYeni = new Map<string, KohortDosyasi>();
  for (const k of kohortlar) {
    if (!k.benchmark_surumu.donduruldu_at) continue;
    const onceki = enYeni.get(k.anahtar);
    if (!onceki || (onceki.benchmark_surumu.donduruldu_at ?? '') < k.benchmark_surumu.donduruldu_at) {
      enYeni.set(k.anahtar, k);
    }
  }
  return kohortlar.map((k) => {
    if (!k.benchmark_surumu.donduruldu_at) return k;
    const guncel = enYeni.get(k.anahtar)!;
    const arsiv = guncel !== k;
    return {
      ...k,
      benchmark_surumu: {
        ...k.benchmark_surumu,
        durum: arsiv ? 'arsiv' : 'yayinda',
        guncel_surum: arsiv ? guncel.benchmark_surumu.surum : null,
      },
    };
  });
}

export interface DondurmaSonucu {
  surum: KohortDosyasi;
  disarida: Array<{ kurum: string; sebep: string }>;
}

/**
 * Taslak kohorttan dondurulmuş sürüm üretir.
 *
 * Referans kümesine yalnız kalite kapısından geçmiş yakalamalar girer
 * (docs/05; veritabanında tetikleyici zorlar). Kurum başına tek kayıt zaten
 * kohort dosyasında zorlanır.
 */
export function surumDondur(
  taslak: KohortDosyasi,
  surum: string,
  onaylayan: string,
  simdi = new Date().toISOString(),
): DondurmaSonucu {
  if (!/^v\d+$/.test(surum)) throw new Error('sürüm adı v1, v2… biçiminde olmalı');
  if (!onaylayan.trim()) throw new Error('onaylayan boş olamaz (docs/03: insan onayı)');
  const disarida = taslak.kayitlar
    .filter((k) => !k.kalite_gecti || !k.capture_id)
    .map((k) => ({ kurum: k.kurum, sebep: k.kalite_gecti ? 'yakalama yok' : `kalite kapısından geçmedi (${k.tarama_durumu})` }));
  const uyeler = taslak.kayitlar.filter((k) => k.kalite_gecti && k.capture_id);
  return {
    surum: {
      ...taslak,
      kayitlar: uyeler,
      onaylayan,
      benchmark_surumu: {
        id: `${taslak.anahtar}@${surum}`,
        surum,
        donduruldu_at: simdi,
        durum: 'yayinda',
        guncel_surum: null,
      },
    },
    disarida,
  };
}
