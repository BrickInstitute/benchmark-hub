// OTOMATİK KOPYA — benchmark-collector/src/lib/bolge-tipleri.ts (scripts/hub-esitle.ts). Burada düzenlemeyin.
/**
 * Bölge tipleri (docs/09 §1). Ayrı dosyadadır ki rapor katmanı bölümleme
 * algoritmasını içe aktarmadan derlenebilsin (bkz. gozlem.ts).
 */
import type { Kutu } from './rapor-sozlesmesi';

export const BOLGE_TURLERI = [
  'menu', 'hero', 'icerik', 'kart_listesi', 'hesaplayici', 'form', 'guven', 'footer', 'cerez',
] as const;
export type BolgeTuru = (typeof BOLGE_TURLERI)[number];

export interface Bolge {
  id: string;
  tur: BolgeTuru;
  /** İnsan okunur ad. Varsayılan türden üretilir; model adı sonradan yazar. */
  ad: string;
  adKaynagi: 'varsayilan' | 'model';
  selector: string | null;
  /** Bölgenin dayandığı blok adayı. Birleşik kutulu bölgelerde (ör. menü satırı) yok. */
  blok: number | null;
  kutu: Kutu;
  kaynak: 'dom' | 'ocr';
  guven: 'yuksek' | 'dusuk';
  /** Yukarıdan aşağıya sıra. */
  sira: number;
}

/** Gözlemin bölgeye hangi yoldan bağlandığı (docs/09 §2.5). */
export type EslemeYolu = 'soyagaci' | 'geometri' | 'katalog' | 'sayfa_geneli';
