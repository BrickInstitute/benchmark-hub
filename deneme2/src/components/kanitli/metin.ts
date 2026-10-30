// OTOMATİK KOPYA — benchmark-collector/web/src/metin.ts (scripts/hub-esitle.ts). Burada düzenlemeyin.
/**
 * Arayüz metinleri. Dil TANIMLAYICIDIR (docs/07 §3): "gömülü" yazar,
 * "daha iyi" yazmaz. Arayüzün hiçbir yerinde "puan" kelimesi geçmez (§10.13).
 */
import type { Durum } from '@/lib/kanitli/rapor-sozlesmesi';

const DEGER: Record<string, string> = {
  var: 'var',
  yok: 'yok',
  ilk_ekran: 'ilk ekran',
  ilk_kaydirma: 'ilk kaydırma',
  sayfa_alti: 'sayfa altı',
  rakam: 'rakam',
  aralik: 'aralık',
  kosullu: 'koşullu',
  yonlendirme: 'yönlendirme',
  gomulu: 'gömülü',
  ayri_sayfa: 'ayrı sayfa',
  statik: 'statik',
  '3_arti': '3+',
  ulasilamadi: 'ulaşılamadı',
  az: 'az',
  orta: 'orta',
  cok: 'çok',
  musteri_yorumu: 'müşteri yorumu',
  sayisal_iddia: 'sayısal iddia',
  sertifika_akreditasyon: 'sertifika / akreditasyon',
  basin_odul: 'basın / ödül',
  kurumsal_referans: 'kurumsal referans',
};

export function degerAdi(d: string | null): string {
  if (d === null) return '—';
  return d
    .split('+')
    .map((p) => DEGER[p] ?? p.replace(/_/g, ' '))
    .join(' + ');
}

export const DURUM_ROZETI: Record<Durum, string> = {
  present: 'Var',
  absent: 'Yok',
  unknown: 'Belirsiz',
  not_applicable: 'Kapsam dışı',
};

const TUR: Record<string, string> = {
  menu: 'menü',
  hero: 'hero',
  icerik: 'içerik',
  kart_listesi: 'kart listesi',
  hesaplayici: 'hesaplayıcı',
  form: 'form',
  guven: 'güven',
  footer: 'footer',
  cerez: 'çerez',
};
export const turAdi = (t: string) => TUR[t] ?? t;

/** P2–P5 merdiven olarak çizilir (§6.2). */
export const SIRALI = new Set(['P2', 'P3', 'P4', 'P5']);

export function tarih(iso: string | null): string {
  if (!iso) return 'tarih yok';
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function birimli(kod: string, n: number): string {
  if (kod === 'U12') return `%${n}`;
  if (kod === 'U01') return `${n} öğe`;
  if (kod === 'U03') return `${n} CTA`;
  if (kod === 'U11') return `${n} zorunlu alan`;
  return String(n);
}
