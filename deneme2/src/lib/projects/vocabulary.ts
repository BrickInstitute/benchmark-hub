/**
 * Fixed vocabularies for the descriptive page analysis.
 *
 * Same rule as PATTERN_STEPS: categories live in software, never in a model
 * response. The model picks one of these keys; anything else is discarded
 * rather than coerced. Without a closed list, "kampanya", "kampanya alanı" and
 * "promosyon bandı" become three modules and no prevalence can be counted.
 *
 * Changing a key changes what earlier analyses meant, so add keys freely but
 * rename or remove only together with a re-analysis of the affected projects.
 */

export interface VocabularyEntry {
  label: string;
  /** Shown to the model and to people reading the report; same definition for both. */
  description: string;
}

/** Page sections ("modules") a benchmark study compares. */
export const MODULE_TYPES = {
  hero: { label: "Hero", description: "Sayfanın en üstündeki ana mesaj alanı: büyük başlık, kısa açıklama, ana eylem düğmesi." },
  urun_kartlari: { label: "Ürün kartları", description: "Birden çok ürün/paketin kart hâlinde yan yana listelendiği alan." },
  karsilastirma_tablosu: { label: "Karşılaştırma tablosu", description: "Ürünlerin ya da paketlerin özelliklerinin satır/sütun olarak karşılaştırıldığı tablo." },
  hesaplama_araci: { label: "Hesaplama aracı", description: "Kullanıcının değer girip sonuç gördüğü hesaplayıcı (taksit, faiz, prim, fiyat)." },
  basvuru_formu: { label: "Başvuru formu", description: "Sayfa içinde doldurulabilen başvuru, teklif veya iletişim formu alanları." },
  kampanya_alani: { label: "Kampanya alanı", description: "Süreli kampanya, indirim veya promosyon duyurusu bandı/kartı." },
  fayda_listesi: { label: "Fayda listesi", description: "Ürünün avantajlarının ikon/madde ile sıralandığı alan." },
  nasil_calisir: { label: "Nasıl çalışır / adımlar", description: "Başvuru veya kullanım sürecini numaralı adımlarla anlatan alan." },
  ucret_faiz_tablosu: { label: "Ücret / faiz bilgisi", description: "Ücret, faiz oranı, aidat, komisyon gibi rakamların listelendiği tablo veya blok." },
  sss: { label: "Sıkça sorulan sorular", description: "Soru-cevap (akordeon) şeklindeki SSS alanı." },
  musteri_yorumlari: { label: "Müşteri yorumları", description: "Kullanıcı yorumları, puanlar, referans alıntıları." },
  guven_rozetleri: { label: "Güven rozetleri / ödüller", description: "Ödül, sertifika, lisans, güvenlik logosu, düzenleyici kurum ibaresi." },
  uygulama_indirme: { label: "Uygulama indirme", description: "Mobil uygulamayı tanıtan, mağaza bağlantısı veya QR kod içeren alan." },
  capraz_satis: { label: "Çapraz satış", description: "Sayfanın konusu dışındaki başka ürünlere yönlendiren kartlar/bantlar." },
  is_ortagi_logolari: { label: "İş ortağı logoları", description: "Anlaşmalı marka, partner, üye işyeri logoları." },
  video: { label: "Video", description: "Sayfa içinde oynatılabilen video alanı." },
  icerik_makale: { label: "İçerik / makale", description: "Bilgilendirici uzun metin, rehber, blog bağlantıları." },
  iletisim_destek: { label: "İletişim / destek", description: "Çağrı merkezi, canlı destek, şube bulucu, iletişim kanalları." },
  yasal_bilgi: { label: "Yasal bilgilendirme", description: "Dipnot, yasal uyarı, sözleşme ve bilgilendirme metinleri." },
  diger: { label: "Diğer", description: "Yukarıdakilerin hiçbirine uymayan bölüm. Başlığını mutlaka alıntıla." },
} as const satisfies Record<string, VocabularyEntry>;

/** What a value proposition promises. */
export const VALUE_THEMES = {
  fiyat_ucret: { label: "Fiyat / ücret", description: "Ücretsizlik, düşük faiz, aidatsızlık, indirimli fiyat." },
  hiz: { label: "Hız", description: "Anında onay, dakikalar içinde, hemen kullan." },
  kolaylik_dijital: { label: "Kolaylık / dijital", description: "Şubeye gitmeden, mobilden, birkaç adımda, evrak istemeden." },
  kazanc_odul: { label: "Kazanç / ödül", description: "Puan, mil, nakit iade (cashback), hediye." },
  esneklik: { label: "Esneklik", description: "Taksit seçenekleri, vade, limit, ödeme esnekliği." },
  guven: { label: "Güven / güvenlik", description: "Güvenli alışveriş, sigorta, kurumsal güvence, köklü geçmiş." },
  ayricalik: { label: "Ayrıcalık / statü", description: "Özel hizmetler, lounge, premium deneyim, VIP." },
  kampanya: { label: "Kampanya / süreli teklif", description: "Belirli tarihe kadar geçerli fırsat, hoş geldin kampanyası." },
  destek_hizmet: { label: "Destek / hizmet", description: "7/24 destek, kişisel danışman, hızlı çözüm." },
  kapsam_secenek: { label: "Kapsam / seçenek", description: "Geniş ürün yelpazesi, çok sayıda anlaşmalı nokta, her ihtiyaca uygun." },
  diger: { label: "Diğer", description: "Yukarıdakilerin hiçbirine uymayan vaat." },
} as const satisfies Record<string, VocabularyEntry>;

/** What the hero shows besides text. Read off the screenshot only. */
export const HERO_VISUALS = {
  urun_gorseli: { label: "Ürün görseli", description: "Ürünün kendisi (kart, cihaz, ambalaj) ön planda." },
  insan_fotografi: { label: "İnsan fotoğrafı", description: "Model/müşteri fotoğrafı ön planda." },
  illustrasyon: { label: "İllüstrasyon", description: "Çizim, 3B render, ikonografik görsel." },
  video: { label: "Video / animasyon", description: "Otomatik oynayan video veya animasyon." },
  slider: { label: "Kaydırmalı banner", description: "Birden çok slaytın döndüğü karusel." },
  yalniz_metin: { label: "Yalnız metin", description: "Belirgin bir görsel yok, metin ve düğme." },
  diger: { label: "Diğer", description: "Yukarıdakilerin hiçbiri." },
} as const satisfies Record<string, VocabularyEntry>;

export type ModuleType = keyof typeof MODULE_TYPES;
export type ValueTheme = keyof typeof VALUE_THEMES;
export type HeroVisual = keyof typeof HERO_VISUALS;

export function isModuleType(v: unknown): v is ModuleType {
  return typeof v === "string" && v in MODULE_TYPES;
}
export function isValueTheme(v: unknown): v is ValueTheme {
  return typeof v === "string" && v in VALUE_THEMES;
}
export function isHeroVisual(v: unknown): v is HeroVisual {
  return typeof v === "string" && v in HERO_VISUALS;
}

/** "key: label - description" lines for a prompt. */
export function vocabularyForPrompt(v: Record<string, VocabularyEntry>): string {
  return Object.entries(v)
    .map(([k, e]) => `- ${k}: ${e.label} - ${e.description}`)
    .join("\n");
}

export const PLACEMENT_LABEL: Record<string, string> = {
  ilk_ekran: "İlk ekran",
  ilk_kaydirma: "İlk kaydırma",
  sayfa_alti: "Sayfa altı",
};
