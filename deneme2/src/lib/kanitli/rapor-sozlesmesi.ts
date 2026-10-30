// OTOMATİK KOPYA — benchmark-collector/src/lib/rapor-sozlesmesi.ts (scripts/hub-esitle.ts). Burada düzenlemeyin.
/**
 * Rapor API sözleşmesi (docs/09 §4). Sunucu ve arayüz bu tipleri paylaşır.
 *
 * docs/09: "Değiştirilemez olan alan adları ve anlamlarıdır." Buradaki alanlar
 * şartnamedeki örnekle birebir aynıdır; şartnamede olmayanlar yalnızca EKtir
 * ve yanlarında gerekçesi yazılıdır.
 *
 * Bu dosya Node veya tarayıcıya özgü hiçbir şey içe aktarmaz.
 */

export type Durum = 'present' | 'absent' | 'unknown' | 'not_applicable';

export interface Kutu {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RaporBolgesi {
  id: string;
  tur: string;
  ad: string;
  kutu: Kutu;
  kaynak: 'dom' | 'ocr';
  guven: 'yuksek' | 'dusuk';
  /** karsilanan = present; gecerli = not_applicable dışındaki gözlemler. */
  kapsam: { karsilanan: number; gecerli: number };
  gozlem_sayisi: Record<Durum, number>;
  /** EK: yukarıdan aşağıya sıra; Tab gezinmesi bu sırayı izler (§5.6). */
  sira: number;
}

export interface DagilimSatiri {
  deger: string;
  adet: number;
  /** payda < 8 ise null (§4.1). */
  yuzde: number | null;
}

export interface Dagilim {
  payda: number;
  satirlar: DagilimSatiri[];
  haric_tutulan: { unknown: number; not_applicable: number };
  uyari?: 'ornek_az';
  /** EK: tüm payda tek basamakta; "bu ölçüt kohortta ayrım yaratmıyor" (§8). */
  ayrim_yok?: boolean;
}

export interface RaporKaniti {
  metin: string;
  kutu: Kutu | null;
  dom_match: 'exact' | 'normalized' | 'none';
  belirsiz: boolean;
  dogrulandi: boolean;
  /** EK: kanıtı model mi söyledi, yazılım mı buldu (docs/01 "Kanıtın iki kaynağı"). */
  kaynak: 'model_alintisi' | 'dom_ogesi';
}

export interface RaporGozlemi {
  id: string;
  /** null = "Sayfa geneli" sanal bölgesi (§2.5 adım 4). */
  region_id: string | null;
  criterion_kod: string;
  criterion_soru: string;
  pattern: string;
  deger: string | null;
  deger_sirasi: number | null;
  basamaklar: string[];
  /** EK: P6'da ham sayı ("8 öğe · orta"). */
  ham_sayi: number | null;
  status: Durum;
  /**
   * EK: unknown/not_applicable sebebi. §6.2: "unknown asla 'yok' gibi
   * gösterilmez; rozet 'Belirsiz', altında sebebi yazılır."
   */
  sebep: string | null;
  /** EK: katalogdaki na_kosulu metni (§6.2). */
  na_kosulu: string | null;
  kanit: RaporKaniti | null;
  dagilim: Dagilim;
  ornek_sayisi: number;
}

export interface RaporGovdesi {
  rapor: {
    id: string;
    olusturuldu_at: string;
    benchmark_surumu: {
      id: string;
      surum: string;
      donduruldu_at: string | null;
      /** EK: dondurulmamış (veritabanı öncesi deneme) sürümde arayüz şerit gösterir. */
      durum: 'taslak' | 'yayinda' | 'arsiv';
      /** EK: arşivlenmiş sürümde güncel sürüm adı (§8). */
      guncel_surum?: string | null;
      /** EK: dondurulmuş sürümü onaylayan (docs/03 insan onayı). */
      onaylayan?: string | null;
    };
    kohort: {
      sektor: string;
      sayfa_turu: string;
      sayfa_turu_ad: string;
      viewport: string;
      ulke: string;
      kurum_sayisi: number;
    };
  };
  yakalama: {
    id: string;
    /** EK: raporun ait olduğu kurum. */
    kurum: string;
    url: string;
    alindi_at: string | null;
    kaynak: 'tarama' | 'kullanici_yuklemesi';
    goruntu: { url: string; w: number; h: number } | null;
    viewport: { w: number; h: number };
    kalite_gecti: boolean;
  };
  bolgeler: RaporBolgesi[];
  gozlemler: RaporGozlemi[];
}

export interface Ornek {
  kurum: string;
  capture_id: string;
  alindi_at: string | null;
  kaynak_url: string;
  deger: string;
  status: Durum;
  kirpim: {
    goruntu_url: string;
    goruntu_w: number;
    goruntu_h: number;
    kutu: Kutu;
  };
  kanit_metni: string | null;
  kanit_kutusu: Kutu | null;
}

export interface OrneklerYaniti {
  olcut: { kod: string; soru: string; pattern: string };
  kullanicinin_degeri: string | null;
  /** EK: basamak sekmelerindeki sayılar (§7.3) — gösterilebilir örnek adedi. */
  basamak_sayilari: Array<{ deger: string; adet: number }>;
  ornekler: Ornek[];
  sonraki_imlec: string | null;
}

export interface RaporListesiOgesi {
  id: string;
  /** EK: "deneme" (taslak) veya v1, v2… */
  surum: string;
  surum_durumu: 'taslak' | 'yayinda' | 'arsiv';
  kurum: string;
  sektor: string;
  viewport: string;
  url: string;
  kalite_gecti: boolean;
}

/** Arayüz metinleri için durum etiketleri: renkten bağımsız okunur (§5.6). */
export const DURUM_ETIKETI: Record<Durum, string> = {
  present: 'Var',
  absent: 'Yok',
  unknown: 'Belirsiz',
  not_applicable: 'Kapsam dışı',
};

/** Yüzde ancak bu paydadan itibaren gösterilir (§4.1). */
export const ASGARI_YUZDE_PAYDASI = 8;
