// OTOMATİK KOPYA — benchmark-collector/src/lib/olcum.ts (scripts/hub-esitle.ts). Burada düzenlemeyin.
/**
 * Kalıp hesapları ve durum türetme (docs/01).
 * Bunların hiçbirini model yapmaz; hepsi yazılım tarafında deterministiktir.
 */
import type { Kutu } from './rapor-sozlesmesi';

export type Durum = 'present' | 'absent' | 'unknown' | 'not_applicable';
export type Konum = 'ilk_ekran' | 'ilk_kaydirma' | 'sayfa_alti' | 'yok';

/** P2 — konum, kutunun y değeri ile görünüm yüksekliğinden hesaplanır. */
export function konumHesapla(kutu: Kutu | null, viewportYuksekligi: number): Konum {
  if (!kutu) return 'yok';
  if (kutu.y < viewportYuksekligi) return 'ilk_ekran';
  if (kutu.y < viewportYuksekligi * 2) return 'ilk_kaydirma';
  return 'sayfa_alti';
}

export type Kova = 'az' | 'orta' | 'cok';
export type KovaEsikleri = Record<Kova, [number, number | null]>;

/** P6 — ham sayı kovaya düşürülür. Ham sayı da saklanır. */
export function kovaHesapla(sayi: number, esikler: KovaEsikleri): Kova {
  for (const ad of ['az', 'orta', 'cok'] as const) {
    const aralik = esikler[ad];
    if (!aralik) continue;
    const [alt, ust] = aralik;
    if (sayi >= alt && (ust === null || sayi <= ust)) return ad;
  }
  return 'cok';
}

/** P5 — tıklama sayısı basamağa çevrilir. */
export function derinlikBasamagi(tiklama: number | null): string {
  if (tiklama === null) return 'ulasilamadi';
  if (tiklama <= 0) return '0';
  if (tiklama === 1) return '1';
  if (tiklama === 2) return '2';
  return '3_arti';
}

const ABSENT_DEGERLER = new Set(['yok']);
const UNKNOWN_DEGERLER = new Set(['ulasilamadi']);

export interface DurumGirdisi {
  deger: string | string[] | null;
  naKosuluSaglandi: boolean;
  yakalamaKalitesiGecti: boolean;
  kanitDogrulandi: boolean;
  /** Ölçüt kanıt metni gerektiriyor mu? P5/P6 gibi hesaplananlar gerektirmez. */
  kanitGerekli: boolean;
  tekrarUyustu: boolean;
}

/**
 * docs/01 "Durum türetme kuralı". Sıra önemlidir ve değiştirilmemelidir:
 * tarama hatası hiçbir koşulda `absent` üretmez.
 */
export function durumTuret(g: DurumGirdisi): Durum {
  if (g.naKosuluSaglandi) return 'not_applicable';
  if (!g.yakalamaKalitesiGecti) return 'unknown';
  if (!g.tekrarUyustu) return 'unknown';

  const bos =
    g.deger === null ||
    (Array.isArray(g.deger) && g.deger.length === 0) ||
    (typeof g.deger === 'string' && ABSENT_DEGERLER.has(g.deger));

  if (typeof g.deger === 'string' && UNKNOWN_DEGERLER.has(g.deger)) return 'unknown';
  if (bos) return 'absent';
  if (g.kanitGerekli && !g.kanitDogrulandi) return 'unknown';
  return 'present';
}

/** Kalıp başına kanıt metni gerekip gerekmediği. */
export function kanitGerekliMi(pattern: string): boolean {
  return pattern === 'P1' || pattern === 'P3' || pattern === 'P4' || pattern === 'P7';
}

/**
 * İki yakalamanın içerik benzerliği (0–1).
 *
 * Neden hash yetmiyor: ekran görüntüsü hash'i karusel/animasyon yüzünden her
 * yüklemede değişir; metin imzası ise tek karakterlik oynamada (sayaç, tarih,
 * dönen slogan) değişir. Ölçülen bir hastane sitesinde üç arka arkaya
 * yakalamanın yapısal ölçümleri birebir aynıyken imza iki farklı değer verdi.
 *
 * Bu yüzden değişim kararı eşiğe bağlanır: ekrandaki metin kümeleri arasındaki
 * Jaccard benzerliği. `YENIDEN_ANALIZ_ESIGI` altına düşerse sayfa gerçekten
 * değişmiştir ve yeniden analiz edilir.
 */
export function icerikBenzerligi(a: string[], b: string[]): number {
  const kumeA = new Set(a.map((s) => s.trim().toLowerCase()).filter(Boolean));
  const kumeB = new Set(b.map((s) => s.trim().toLowerCase()).filter(Boolean));
  if (kumeA.size === 0 && kumeB.size === 0) return 1;
  let kesisim = 0;
  for (const x of kumeA) if (kumeB.has(x)) kesisim++;
  const birlesim = kumeA.size + kumeB.size - kesisim;
  return birlesim === 0 ? 1 : kesisim / birlesim;
}

/** Bu benzerliğin altındaki fark "sayfa değişti" sayılır ve yeniden analiz gerektirir. */
export const YENIDEN_ANALIZ_ESIGI = 0.98;

export interface DagilimSatiri {
  deger: string;
  adet: number;
  yuzde: number;
}

/**
 * docs/01 "Yüzde hesabı kuralı".
 * Paydaya yalnızca present + absent girer; kurum başına tek gözlem beklenir.
 */
export function dagilimHesapla(
  gozlemler: Array<{ deger: string | null; status: Durum }>,
): { payda: number; dagilim: DagilimSatiri[] } {
  const gecerli = gozlemler.filter((g) => g.status === 'present' || g.status === 'absent');
  const payda = gecerli.length;
  const sayim = new Map<string, number>();
  for (const g of gecerli) {
    const d = g.status === 'absent' ? 'yok' : (g.deger ?? 'yok');
    sayim.set(d, (sayim.get(d) ?? 0) + 1);
  }
  const dagilim = [...sayim.entries()]
    .map(([deger, adet]) => ({
      deger,
      adet,
      yuzde: payda === 0 ? 0 : Math.round((adet / payda) * 100),
    }))
    .sort((a, b) => b.adet - a.adet);
  return { payda, dagilim };
}
