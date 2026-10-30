// OTOMATİK KOPYA — benchmark-collector/src/lib/gozlem.ts (scripts/hub-esitle.ts). Burada düzenlemeyin.
/**
 * Gözlem tipi — değerlendiricinin ürettiği, raporun tükettiği kayıt.
 *
 * Ayrı dosyadadır ki rapor katmanı (rapor.ts) yakalama ve değerlendirme
 * zincirini (DOM toplayıcı, kanıt arayıcı) içe aktarmadan derlenebilsin;
 * rapor katmanı başka bir uygulamaya (UI Benchmark Hub) gömülürken yalnız
 * bu tipler taşınır (scripts/hub-esitle.ts).
 */
import type { Durum, Kutu } from './rapor-sozlesmesi';

export interface Gozlem {
  kod: string;
  pattern: string;
  deger: string | null;
  hamSayi: number | null;
  status: Durum;
  kanit: {
    metin: string;
    kutu: Kutu | null;
    eslesme: 'exact' | 'normalized' | 'none';
    kaynak: 'model_alintisi' | 'dom_ogesi';
    belirsiz: boolean;
    selector: string | null;
    blok: number | null;
  } | null;
  /** Neden not_applicable veya unknown olduğu — arayüzde gösterilecek. */
  not: string | null;
  /**
   * `absent` sonucu modelin ekran görüntüsünde teyidini bekliyor mu?
   *
   * DOM tek başına "yok" diyemez: telefon numarası bir görselin içindeyse
   * DOM'da hiç geçmez ama insan ekranda görür. `present` kanıtla ispatlanır,
   * `absent` ise sayfanın TAMAMI hakkında bir iddiadır ve DOM'dan ispatlanamaz.
   * Bu bayrak açıkken gözlem yayınlanmaz; model teyit edene kadar bekler.
   */
  teyitBekliyor: boolean;
}
