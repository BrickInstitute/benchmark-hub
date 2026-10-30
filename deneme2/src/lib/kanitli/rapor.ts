// OTOMATİK KOPYA — benchmark-collector/src/lib/rapor.ts (scripts/hub-esitle.ts). Burada düzenlemeyin.
/**
 * Rapor gövdesi ve "Diğer örnekler" üretimi (docs/09 §4).
 *
 * Saf fonksiyonlar: girdi bir kohort dosyasıdır (yakalama + bölgeler +
 * eşlenmiş gözlemler), çıktı API sözleşmesidir (rapor-sozlesmesi.ts).
 * Veritabanı bağlandığında yalnızca kohort dosyasını üreten katman değişir;
 * buradaki kurallar aynı kalır.
 */
import type { Bolge, EslemeYolu } from './bolge-tipleri';
import type { Gozlem } from './gozlem';
import { dagilimHesapla, kanitGerekliMi } from './olcum';
import {
  ASGARI_YUZDE_PAYDASI,
  type Dagilim,
  type Durum,
  type Kutu,
  type Ornek,
  type OrneklerYaniti,
  type RaporBolgesi,
  type RaporGovdesi,
  type RaporGozlemi,
} from './rapor-sozlesmesi';

export type EslenmisGozlem = Gozlem & { region_id: string | null; region_eslemesi: EslemeYolu };

export interface KohortKaydi {
  kurum: string;
  kurum_id: string;
  url: string;
  capture_id: string | null;
  alindi_at: string | null;
  kalite_gecti: boolean;
  tarama_durumu: string;
  /** Tam sayfa görüntüsünün depo anahtarı ve boyutu. */
  goruntu: { key: string; w: number; h: number } | null;
  viewport: { w: number; h: number };
  bolgeler: Bolge[];
  gozlemler: EslenmisGozlem[];
}

export interface KohortDosyasi {
  anahtar: string;
  olusturuldu_at: string;
  sektor: string;
  sektor_ad: string;
  sayfa_turu: string;
  sayfa_turu_ad: string;
  viewport: string;
  ulke: string;
  benchmark_surumu: RaporGovdesi['rapor']['benchmark_surumu'];
  /** Dondurulmuş sürümü onaylayan kişi (docs/03 insan onayı). Taslakta yok. */
  onaylayan?: string;
  /**
   * Yayın paketinde gömülü katalog. Rapor başka bir uygulamada (UI Benchmark
   * Hub) sunulurken katalog dosyaları orada yoktur; yayınlanan kohort kendi
   * ölçüt tanımlarını taşır (scripts/hub-yayinla.ts).
   */
  katalog?: KatalogOlcutu[];
  kayitlar: KohortKaydi[];
}

export interface KatalogOlcutu {
  kod: string;
  pattern: string;
  soru: string;
  na_kosulu: string | null;
  basamaklar: string[];
}

/**
 * Görüntü URL'i. Bu repodaki sunucu `storage/` altını `/storage/` önekiyle
 * yayınlar; rapor başka bir uygulamaya gömüldüğünde (UI Benchmark Hub) önek
 * oranın dosya ucudur.
 */
export function goruntuUrl(key: string, onEk = '/storage/'): string {
  return `${onEk}${key}`;
}

/**
 * Yayınlanabilir durum.
 *
 * `teyitBekliyor` açık bir `absent` YAYINLANMAZ (docs/01 "Asimetrik
 * doğrulama"): DOM tek başına yokluğu ispatlayamaz. Raporda bu gözlem
 * `unknown` olur ve paydaya girmez; sebebi açıkça yazılır.
 */
export function yayinDurumu(g: Gozlem): { status: Durum; sebep: string | null } {
  if (g.teyitBekliyor && g.status === 'absent') {
    return {
      status: 'unknown',
      sebep: '"Yok" sonucu ekran görüntüsünde teyit bekliyor — DOM tek başına yokluğu kanıtlayamaz',
    };
  }
  if (g.status === 'unknown' || g.status === 'not_applicable') {
    return { status: g.status, sebep: g.not };
  }
  return { status: g.status, sebep: null };
}

/** Dağılımda bir gözlemin hangi basamağa düştüğü. */
function dagilimDegeri(g: Gozlem, status: Durum): string {
  return status === 'absent' ? 'yok' : (g.deger ?? 'yok');
}

function basamaklarAl(o: KatalogOlcutu, gozlemler: Gozlem[]): string[] {
  const b = [...o.basamaklar];
  // P6 basamakları kovadır (az/orta/çok); hiç sayılmayan durum "yok"tur.
  for (const g of gozlemler) {
    const d = g.status === 'absent' ? 'yok' : g.deger;
    if (d && !b.includes(d)) b.push(d);
  }
  return b;
}

export function dagilimUret(
  kod: string,
  kohort: KohortKaydi[],
  basamaklar: string[],
): Dagilim {
  const yayinlanan = kohort
    .map((k) => k.gozlemler.find((g) => g.kod === kod))
    .filter((g): g is EslenmisGozlem => Boolean(g))
    .map((g) => ({ g, ...yayinDurumu(g) }));

  const { payda, dagilim } = dagilimHesapla(
    yayinlanan.map((y) => ({ deger: y.status === 'absent' ? 'yok' : y.g.deger, status: y.status })),
  );
  const yuzdeGoster = payda >= ASGARI_YUZDE_PAYDASI;
  const sayim = new Map(dagilim.map((d) => [d.deger, d.adet]));
  const sira = [...basamaklar, ...dagilim.map((d) => d.deger).filter((d) => !basamaklar.includes(d))];

  const sonuc: Dagilim = {
    payda,
    satirlar: sira.map((deger) => {
      const adet = sayim.get(deger) ?? 0;
      return {
        deger,
        adet,
        yuzde: yuzdeGoster && payda > 0 ? Math.round((adet / payda) * 100) : null,
      };
    }),
    haric_tutulan: {
      unknown: yayinlanan.filter((y) => y.status === 'unknown').length,
      not_applicable: yayinlanan.filter((y) => y.status === 'not_applicable').length,
    },
  };
  if (!yuzdeGoster) sonuc.uyari = 'ornek_az';
  // Tek kurumluk paydada "ayrım yaratmıyor" demek anlamsızdır.
  if (payda >= 2 && dagilim.length === 1) sonuc.ayrim_yok = true;
  return sonuc;
}

/**
 * Örnek kırpım kutusu: iddiayı kanıtlayan en küçük alan (docs/07 §3).
 *
 * Bölge kutusu varsayılandır. Bölge görünüm yüksekliğinden büyükse (uzun
 * içerik, footer) kanıt kutusunun çevresiyle sınırlanır; kanıt yoksa bölgenin
 * üst kısmı alınır. Kutu bulunamazsa örnek gösterilmez.
 */
export function kirpimKutusu(
  g: EslenmisGozlem,
  kayit: KohortKaydi,
): Kutu | null {
  const bolge = g.region_id ? kayit.bolgeler.find((b) => b.id === g.region_id) : undefined;
  const kanitKutusu = g.kanit?.kutu ?? null;
  const vh = kayit.viewport.h;
  const W = kayit.goruntu?.w ?? kayit.viewport.w;
  const H = kayit.goruntu?.h ?? vh;
  const sinirla = (k: Kutu): Kutu => {
    const x = Math.max(0, k.x);
    const y = Math.max(0, k.y);
    return { x, y, w: Math.min(W - x, k.w), h: Math.min(H - y, k.h) };
  };

  if (bolge && bolge.kutu.h <= vh) return sinirla(bolge.kutu);
  if (kanitKutusu) {
    const pay = 80;
    const k = {
      x: kanitKutusu.x - pay,
      y: kanitKutusu.y - pay,
      w: kanitKutusu.w + pay * 2,
      h: kanitKutusu.h + pay * 2,
    };
    // Bölge varsa onun dışına taşma: kırpım bölgeyle kesişimdir.
    if (bolge) {
      const x1 = Math.max(k.x, bolge.kutu.x);
      const y1 = Math.max(k.y, bolge.kutu.y);
      const x2 = Math.min(k.x + k.w, bolge.kutu.x + bolge.kutu.w);
      const y2 = Math.min(k.y + k.h, bolge.kutu.y + bolge.kutu.h);
      if (x2 > x1 && y2 > y1) return sinirla({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
    }
    return sinirla(k);
  }
  if (bolge) return sinirla({ ...bolge.kutu, h: Math.min(bolge.kutu.h, vh) });
  return null;
}

/** §4.2 kural 1–2: kohort üyesi, yayınlanabilir durum, doğrulanmış kanıt, kırpılabilir kutu. */
function ornekAdayi(kayit: KohortKaydi, kod: string, onEk?: string): Ornek | null {
  if (!kayit.kalite_gecti || !kayit.capture_id || !kayit.goruntu) return null;
  const g = kayit.gozlemler.find((x) => x.kod === kod);
  if (!g) return null;
  const { status } = yayinDurumu(g);
  if (status !== 'present' && status !== 'absent') return null;
  // dom_match = 'none' olan gözlem örnek olamaz. Kanıt gerektirmeyen
  // kalıplar (P5, P6) yazılımca hesaplanır; bölge kırpımı onların kanıtıdır.
  if (kanitGerekliMi(g.pattern) && !g.kanit) return null;
  if (g.kanit && g.kanit.eslesme === 'none') return null;
  const kutu = kirpimKutusu(g, kayit);
  if (!kutu || kutu.w < 8 || kutu.h < 8) return null;
  // Güvenlik ağı (docs/07 §3 "iddiayı kanıtlayan en küçük alan"): görünümün
  // 1,5 katından uzun kırpım tam sayfa göstermeye yaklaşır; örnek olamaz.
  if (kutu.h > kayit.viewport.h * 1.5) return null;
  return {
    kurum: kayit.kurum,
    capture_id: kayit.capture_id,
    alindi_at: kayit.alindi_at,
    kaynak_url: kayit.url,
    deger: dagilimDegeri(g, status),
    status,
    kirpim: {
      goruntu_url: goruntuUrl(kayit.goruntu.key, onEk),
      goruntu_w: kayit.goruntu.w,
      goruntu_h: kayit.goruntu.h,
      kutu,
    },
    kanit_metni: g.kanit?.metin ?? null,
    kanit_kutusu: g.kanit?.kutu ?? null,
  };
}

export interface OrnekSorgusu {
  criterion_kod: string;
  haric_kurum_id?: string | null;
  deger?: string | null;
  farkli_olanlar?: boolean;
  limit?: number;
  imlec?: string | null;
  /** Görüntü URL öneki; bkz. goruntuUrl. */
  goruntuOnEki?: string;
}

function imlecCoz(imlec: string | null | undefined): number {
  if (!imlec) return 0;
  try {
    const o = JSON.parse(Buffer.from(imlec, 'base64url').toString('utf8')) as { o?: unknown };
    return typeof o.o === 'number' && o.o >= 0 ? Math.floor(o.o) : 0;
  } catch {
    return 0;
  }
}

function imlecYaz(ofset: number): string {
  return Buffer.from(JSON.stringify({ o: ofset }), 'utf8').toString('base64url');
}

export function ornekleriGetir(
  kohort: KohortDosyasi,
  katalog: Map<string, KatalogOlcutu>,
  s: OrnekSorgusu,
): OrneklerYaniti {
  const olcut = katalog.get(s.criterion_kod);
  const haric = s.haric_kurum_id ?? null;
  const kendi = haric ? kohort.kayitlar.find((k) => k.kurum_id === haric) : undefined;
  const kendiGozlem = kendi?.gozlemler.find((g) => g.kod === s.criterion_kod);
  const kullanicininDegeri = kendiGozlem
    ? (() => {
        const { status } = yayinDurumu(kendiGozlem);
        return status === 'present' || status === 'absent' ? dagilimDegeri(kendiGozlem, status) : null;
      })()
    : null;

  // Kural 1 ve 3: kurum başına tek kayıt, kullanıcının kendi kurumu hariç.
  const tumu = kohort.kayitlar
    .filter((k) => k.kurum_id !== haric)
    .map((k) => ornekAdayi(k, s.criterion_kod, s.goruntuOnEki))
    .filter((o): o is Ornek => o !== null);

  const sayim = new Map<string, number>();
  for (const o of tumu) sayim.set(o.deger, (sayim.get(o.deger) ?? 0) + 1);

  let liste = s.deger ? tumu.filter((o) => o.deger === s.deger) : tumu;
  // Kural 4: önce kullanıcınınkinden FARKLI basamaktakiler, her grupta en yeni önce.
  const farkliOnce = s.farkli_olanlar !== false;
  liste = [...liste].sort((a, b) => {
    if (farkliOnce && kullanicininDegeri !== null) {
      const fa = a.deger === kullanicininDegeri ? 1 : 0;
      const fb = b.deger === kullanicininDegeri ? 1 : 0;
      if (fa !== fb) return fa - fb;
    }
    return (b.alindi_at ?? '').localeCompare(a.alindi_at ?? '') || a.kurum.localeCompare(b.kurum, 'tr');
  });

  const limit = Math.min(Math.max(s.limit ?? 6, 1), 24);
  const ofset = imlecCoz(s.imlec);
  const sayfa = liste.slice(ofset, ofset + limit);
  const sonraki = ofset + limit < liste.length ? imlecYaz(ofset + limit) : null;

  const basamaklar = olcut ? basamaklarAl(olcut, []) : [];
  const degerler = [...basamaklar, ...[...sayim.keys()].filter((d) => !basamaklar.includes(d))];

  return {
    olcut: {
      kod: s.criterion_kod,
      soru: olcut?.soru ?? s.criterion_kod,
      pattern: olcut?.pattern ?? '',
    },
    kullanicinin_degeri: kullanicininDegeri,
    basamak_sayilari: degerler.map((deger) => ({ deger, adet: sayim.get(deger) ?? 0 })),
    ornekler: sayfa,
    sonraki_imlec: sonraki,
  };
}

/** §4.1 rapor gövdesi. `kurum_id` kohorttaki bir kaydı göstermelidir. */
export function raporOlustur(
  kohort: KohortDosyasi,
  katalog: Map<string, KatalogOlcutu>,
  kurumId: string,
  goruntuOnEki?: string,
): RaporGovdesi | null {
  const kayit = kohort.kayitlar.find((k) => k.kurum_id === kurumId);
  if (!kayit || !kayit.capture_id) return null;

  const tumGozlemler = kohort.kayitlar.flatMap((k) => k.gozlemler);

  const gozlemler: RaporGozlemi[] = kayit.gozlemler.map((g, i) => {
    const olcut: KatalogOlcutu = katalog.get(g.kod) ?? {
      kod: g.kod, pattern: g.pattern, soru: g.kod, na_kosulu: null, basamaklar: [],
    };
    const { status, sebep } = yayinDurumu(g);
    const basamaklar = basamaklarAl(olcut, tumGozlemler.filter((x) => x.kod === g.kod));
    const deger = status === 'present' || status === 'absent' ? dagilimDegeri(g, status) : null;
    const sira = deger !== null ? basamaklar.indexOf(deger) : -1;
    const ornekSayisi = ornekleriGetir(kohort, katalog, {
      criterion_kod: g.kod,
      haric_kurum_id: kurumId,
      limit: 24,
      goruntuOnEki,
    }).basamak_sayilari.reduce((t, b) => t + b.adet, 0);

    return {
      id: `obs_${i + 1}`,
      region_id: g.region_id,
      criterion_kod: g.kod,
      criterion_soru: olcut.soru,
      pattern: g.pattern,
      deger,
      deger_sirasi: sira >= 0 ? sira : null,
      basamaklar,
      ham_sayi: g.hamSayi,
      status,
      sebep,
      na_kosulu: status === 'not_applicable' ? olcut.na_kosulu : null,
      kanit: g.kanit
        ? {
            metin: g.kanit.metin,
            kutu: g.kanit.kutu,
            dom_match: g.kanit.eslesme,
            belirsiz: g.kanit.belirsiz,
            dogrulandi: true,
            kaynak: g.kanit.kaynak,
          }
        : null,
      dagilim: dagilimUret(g.kod, kohort.kayitlar, basamaklar),
      ornek_sayisi: ornekSayisi,
    };
  });

  const bolgeler: RaporBolgesi[] = kayit.bolgeler.map((b) => {
    const ait = gozlemler.filter((g) => g.region_id === b.id);
    const say = (d: Durum) => ait.filter((g) => g.status === d).length;
    return {
      id: b.id,
      tur: b.tur,
      ad: b.ad,
      kutu: b.kutu,
      kaynak: b.kaynak,
      guven: b.guven,
      kapsam: { karsilanan: say('present'), gecerli: ait.length - say('not_applicable') },
      gozlem_sayisi: {
        present: say('present'),
        absent: say('absent'),
        unknown: say('unknown'),
        not_applicable: say('not_applicable'),
      },
      sira: b.sira,
    };
  });

  // Kalite kapısından kalan yakalama: tüm gözlemler unknown (§8). Değerlendirici
  // bunu zaten üretir; burada bir kez daha zorlanır ki hiçbir yol sızdırmasın.
  if (!kayit.kalite_gecti) {
    for (const g of gozlemler) {
      if (g.status === 'present' || g.status === 'absent') {
        g.status = 'unknown';
        g.sebep = 'yakalama kalite kapısından geçmedi';
        g.deger = null;
        g.deger_sirasi = null;
      }
    }
  }

  return {
    rapor: {
      id: `${kohort.benchmark_surumu.id}~${kayit.kurum_id}`,
      olusturuldu_at: kohort.olusturuldu_at,
      benchmark_surumu: { ...kohort.benchmark_surumu, onaylayan: kohort.onaylayan ?? null },
      kohort: {
        sektor: kohort.sektor_ad,
        sayfa_turu: kohort.sayfa_turu,
        sayfa_turu_ad: kohort.sayfa_turu_ad,
        viewport: kohort.viewport,
        ulke: kohort.ulke,
        kurum_sayisi: kohort.kayitlar.length,
      },
    },
    yakalama: {
      id: kayit.capture_id,
      kurum: kayit.kurum,
      url: kayit.url,
      alindi_at: kayit.alindi_at,
      kaynak: 'tarama',
      goruntu: kayit.goruntu
        ? { url: goruntuUrl(kayit.goruntu.key, goruntuOnEki), w: kayit.goruntu.w, h: kayit.goruntu.h }
        : null,
      viewport: kayit.viewport,
      kalite_gecti: kayit.kalite_gecti,
    },
    bolgeler,
    gozlemler,
  };
}
