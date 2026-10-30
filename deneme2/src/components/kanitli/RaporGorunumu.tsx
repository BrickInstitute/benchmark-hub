'use client';

// OTOMATİK KOPYA — benchmark-collector/web/src/RaporGorunumu.tsx (scripts/hub-esitle.ts). Burada düzenlemeyin.
/**
 * Etkileşimli rapor (docs/09 §5–§8).
 *
 * Panel konumu ve etkileşimi Floating UI ile yapılır; şartnamedeki elle
 * yazılacak zor kısımların karşılığı:
 *   - giriş 120 ms / çıkış 300 ms        → useHover({ delay })
 *   - imleç panele giderken kapanmasın  → safePolygon() ("güvenli koridor")
 *   - sağda yer yoksa solda, ekrana kenetle, %70 yükseklik → flip/shift/size
 *   - Esc sabitlemeyi kaldırır          → useDismiss
 *   - odak paneli terk edince sabit kalır → FloatingFocusManager closeOnFocusOut=false
 *
 * Bölge kutuları yüzdeyle konumlanır: pencere yeniden boyutlanınca görüntüyle
 * birlikte ölçeklenir, hover'da hiçbir ölçüm (getBoundingClientRect) yapılmaz (§9).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  autoUpdate,
  flip,
  FloatingFocusManager,
  offset,
  safePolygon,
  shift,
  size,
  useDismiss,
  useFloating,
  useHover,
  useInteractions,
  useRole,
} from '@floating-ui/react';
import type { Kutu, RaporBolgesi, RaporGovdesi, RaporGozlemi } from '@/lib/kanitli/rapor-sozlesmesi';
import { Buyutec } from './Buyutec';
import { DigerOrnekler } from './DigerOrnekler';
import { GozlemSatiri } from './GozlemSatiri';
import { tarih, turAdi } from './metin';

const GENEL = '__sayfa_geneli__';

function useMedya(sorgu: string): boolean {
  const [eslesir, setEslesir] = useState(() => window.matchMedia(sorgu).matches);
  useEffect(() => {
    const m = window.matchMedia(sorgu);
    const dinle = () => setEslesir(m.matches);
    m.addEventListener('change', dinle);
    return () => m.removeEventListener('change', dinle);
  }, [sorgu]);
  return eslesir;
}

const yuzde = (deger: number, toplam: number) => `${(deger / toplam) * 100}%`;

function kapsamMetni(b: RaporBolgesi): string {
  if (b.kapsam.gecerli === 0) return 'Bu bölümde değerlendirilen ölçüt yok';
  return `Bu bölümde ${b.kapsam.gecerli} geçerli ölçütün ${b.kapsam.karsilanan}'i karşılanıyor`;
}

export function RaporGorunumu({ rapor, raporId }: { rapor: RaporGovdesi; raporId: string }) {
  const [aktif, setAktif] = useState<string | null>(null);
  const [acik, setAcik] = useState(false);
  const [sabit, setSabit] = useState(false);
  const [kanitKutusu, setKanitKutusu] = useState<Kutu | null>(null);
  const [ornekKodu, setOrnekKodu] = useState<string | null>(null);
  const [buyutec, setBuyutec] = useState<{ kutu: Kutu | null; ad: string | null } | null>(null);
  const dar = useMedya('(max-width: 899px)');
  const dokunmatik = useMedya('(hover: none)');
  const baslikRef = useRef<HTMLHeadingElement>(null);
  const kanitRef = useRef<HTMLDivElement>(null);
  const bolgeRefleri = useRef(new Map<string, HTMLElement>());
  const genelRef = useRef<HTMLButtonElement>(null);

  const g = rapor.yakalama.goruntu;
  const bolgeler = rapor.bolgeler;
  const genelGozlemler = rapor.gozlemler.filter((x) => x.region_id === null);

  // İç içe bölgelerde imlecin altındaki EN DAR bölge kazanır (§5.3): küçük
  // bölge üstte. DOM sırası ise yukarıdan aşağıya kalır ki Tab doğru gezsin (§5.6).
  const zSirasi = useMemo(() => {
    const harita = new Map<string, number>();
    [...bolgeler]
      .sort((a, b) => b.kutu.w * b.kutu.h - a.kutu.w * a.kutu.h)
      .forEach((b, i) => harita.set(b.id, i + 1));
    return harita;
  }, [bolgeler]);

  const kapat = useCallback(() => {
    setAcik(false);
    setSabit(false);
    setKanitKutusu(null);
  }, []);

  // Panel görüntü sütununun dışına taşmaz: sağdaki "Bölümler" listesi (§5.1
  // zorunlu) hiçbir zaman örtülmez. Kabul testinde sabit panelin listeyi
  // örtüp tıklanamaz yaptığı görüldü.
  const [sutun, setSutun] = useState<HTMLElement | null>(null);

  const { refs, floatingStyles, context } = useFloating({
    open: acik,
    onOpenChange(yeni) {
      if (yeni) setAcik(true);
      else kapat();
    },
    placement: 'right-start',
    middleware: [
      offset(12),
      flip({ fallbackPlacements: ['left-start'], padding: 8, ...(sutun ? { boundary: sutun } : {}) }),
      shift({ padding: 8, crossAxis: true, ...(sutun ? { boundary: sutun } : {}) }),
      size({
        padding: 8,
        apply({ availableHeight, elements }) {
          elements.floating.style.maxHeight = `${Math.max(220, Math.min(availableHeight, window.innerHeight * 0.7))}px`;
        },
      }),
    ],
    whileElementsMounted: autoUpdate,
  });

  const hover = useHover(context, {
    enabled: !sabit && !dar && !dokunmatik,
    delay: { open: 120, close: 300 },
    handleClose: safePolygon({ buffer: 2 }),
    mouseOnly: true,
    move: true,
  });
  const dismiss = useDismiss(context, { outsidePress: false, escapeKey: true });
  const role = useRole(context, { role: 'dialog' });
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, dismiss, role]);

  // Bölgeler tek bir panel paylaşır; referans hover anında değişir. useHover
  // dinleyicilerini yeni referansa render'dan SONRA bağlar, yani imlecin o
  // öğeye girdiği `mouseenter` kaçar (imleç kıpırdamadan sayfa kaydırılınca
  // panel hiç açılmazdı). Commit'ten sonra olay yeniden bildirilir. Bu etki
  // useHover'dan sonra tanımlıdır ki dinleyiciler o anda bağlanmış olsun.
  const [hoverAdayi, setHoverAdayi] = useState<{ el: HTMLElement } | null>(null);
  useEffect(() => {
    const el = hoverAdayi?.el;
    if (el && el.isConnected && el.matches(':hover')) el.dispatchEvent(new MouseEvent('mouseenter'));
  }, [hoverAdayi]);
  // Panel açıkken bölgeler arası geçiş de 120 ms niyet ister: imleç bir
  // bölgenin üstünden geçip panele giderken panel içeriği titremez.
  const gecis = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(gecis.current), []);

  // "Diğer örnekler" açıkken Esc önce onu kapatır; panel sabit kalır.
  useEffect(() => {
    if (!ornekKodu) return;
    const tus = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Levhanın içinde açık bir kırpım büyütmesi varsa Esc önce onu kapatır.
      if (document.querySelector('[data-esc-oncelikli]')) return;
      e.stopPropagation();
      setOrnekKodu(null);
    };
    window.addEventListener('keydown', tus, true);
    return () => window.removeEventListener('keydown', tus, true);
  }, [ornekKodu]);

  const ac = useCallback(
    (id: string, el: HTMLElement | null, odakla: boolean) => {
      if (el) refs.setReference(el);
      // Dar ekranda panel alt levhadır ve görüntünün alt %70'ini örter;
      // seçilen bölge levhanın üstünde görünür kalsın.
      if (dar && el && id !== GENEL) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
      setAktif(id);
      setKanitKutusu(null);
      setSabit(true);
      setAcik(true);
      if (odakla) requestAnimationFrame(() => baslikRef.current?.focus());
    },
    [refs, dar],
  );

  const listedenAc = (id: string) => {
    const el = id === GENEL ? genelRef.current : bolgeRefleri.current.get(id) ?? null;
    if (el && id !== GENEL) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    ac(id, el, true);
  };

  useEffect(() => {
    if (kanitKutusu) kanitRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [kanitKutusu]);

  // Örnekler açılınca karşılaştırılan bölge görünür alana gelir.
  useEffect(() => {
    if (!ornekKodu || !aktif || aktif === GENEL) return;
    bolgeRefleri.current.get(aktif)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [ornekKodu, aktif]);

  // Rapor değişince panel ve levhalar sıfırlanır.
  useEffect(() => {
    kapat();
    setOrnekKodu(null);
    setBuyutec(null);
  }, [raporId, kapat]);

  const aktifBolge = bolgeler.find((b) => b.id === aktif) ?? null;
  const aktifGozlemler: RaporGozlemi[] =
    aktif === GENEL ? genelGozlemler : rapor.gozlemler.filter((x) => x.region_id === aktif);

  const bolgeTusu = (e: KeyboardEvent<HTMLDivElement>, b: RaporBolgesi) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      ac(b.id, e.currentTarget, true);
    }
  };

  const olcutlu = bolgeler.filter((b) => rapor.gozlemler.some((x) => x.region_id === b.id));
  const olcutsuz = bolgeler.filter((b) => !olcutlu.includes(b));
  const listeDugmesi = (b: RaporBolgesi) => {
    const n = rapor.gozlemler.filter((x) => x.region_id === b.id).length;
    const varsayilanAd = b.ad.toLocaleLowerCase('tr').startsWith(turAdi(b.tur));
    return (
      <button
        type="button"
        className={acik && aktif === b.id ? 'secili' : undefined}
        onClick={() => listedenAc(b.id)}
        onPointerEnter={() => {
          if (!sabit) bolgeRefleri.current.get(b.id)?.classList.add('isaretli');
        }}
        onPointerLeave={() => bolgeRefleri.current.get(b.id)?.classList.remove('isaretli')}
      >
        <span className="liste-ad">{b.ad}</span>
        <span className="liste-tur">
          {[varsayilanAd ? null : turAdi(b.tur), n ? `${n} ölçüt` : 'ölçüt yok'].filter(Boolean).join(' · ')}
        </span>
        <span
          className="liste-kapsam"
          aria-label={
            b.kapsam.gecerli
              ? `${b.kapsam.gecerli} geçerli ölçütün ${b.kapsam.karsilanan}'i karşılanıyor`
              : 'karşılanabilecek geçerli ölçüt yok'
          }
        >
          {b.kapsam.gecerli ? `${b.kapsam.karsilanan}/${b.kapsam.gecerli}` : '—'}
        </span>
      </button>
    );
  };

  const k = rapor.rapor.kohort;
  const surum = rapor.rapor.benchmark_surumu;
  // Şerit kohort geneli içindir: EN BÜYÜK payda bile 8'in altındaysa. Tek
  // tük ölçütte küçük payda (ör. çoğu sayfada kapsam dışı olan form ölçütü)
  // panelde kendi notuyla gösterilir; 17 kurumluk kohortta "az" denmez.
  const enBuyukPayda = Math.max(0, ...rapor.gozlemler.map((x) => x.dagilim.payda));
  const azOrnek = enBuyukPayda < 8 && rapor.gozlemler.some((x) => x.dagilim.uyari === 'ornek_az');

  // "Diğer örnekler" açıkken panel gizlenir (durumu korunur): görüntü ve
  // vurgulu bölge örneklerle yan yana kalır (§7.1); panel bölgeyi örtmez.
  const panelIcerigi = acik && aktif && !ornekKodu && (
    <div
      ref={refs.setFloating}
      className={`panel${dar ? ' panel-levha' : ''}${sabit ? ' sabit' : ''}`}
      style={dar ? undefined : floatingStyles}
      aria-labelledby="panel-baslik"
      {...getFloatingProps()}
    >
      <header className="panel-ust">
        <div className="panel-baslik-satiri">
          <h3 id="panel-baslik" tabIndex={-1} ref={baslikRef}>
            {aktif === GENEL ? 'Sayfa geneli' : aktifBolge?.ad}
          </h3>
          <div className="panel-dugmeler">
            {aktifGozlemler.some((x) => x.ornek_sayisi > 0) && (
              <button
                type="button"
                className="ikincil"
                onClick={() => {
                  const ilk = aktifGozlemler.find((x) => x.ornek_sayisi > 0);
                  if (ilk) {
                    ac(aktif, refs.domReference.current as HTMLElement | null, false);
                    setOrnekKodu(ilk.criterion_kod);
                  }
                }}
              >
                Diğer örnekler
              </button>
            )}
            {sabit && (
              <button type="button" className="kapat" onClick={kapat} aria-label="Paneli kapat">
                ×
              </button>
            )}
          </div>
        </div>
        <p className="alt-satir">
          {aktif === GENEL
            ? 'Görüntüde bir bölüme bağlanamayan ölçütler'
            : aktifBolge &&
              [
                turAdi(aktifBolge.tur),
                aktifBolge.kaynak === 'ocr'
                  ? 'ekran görüntüsünden çıkarıldı · sayfa yapısı doğrulanmadı'
                  : 'DOM ile doğrulandı',
                aktifBolge.kapsam.gecerli > 0
                  ? `bu bölümde ${aktifBolge.kapsam.karsilanan}/${aktifBolge.kapsam.gecerli} ölçüt karşılanıyor`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
        </p>
      </header>

      <div className="panel-govde">
        {aktifGozlemler.length === 0 ? (
          <p className="bos">Bu bölümde değerlendirilen ölçüt yok.</p>
        ) : (
          aktifGozlemler.map((x) => (
            <GozlemSatiri
              key={x.id}
              g={x}
              kurumSayisi={k.kurum_sayisi}
              onKanitGoster={(kutu) => {
                if (!sabit) ac(aktif, refs.domReference.current as HTMLElement | null, false);
                setKanitKutusu(kutu);
              }}
              onOrnekler={(o) => {
                if (!sabit) ac(aktif, refs.domReference.current as HTMLElement | null, false);
                setOrnekKodu(o.criterion_kod);
              }}
            />
          ))
        )}
      </div>

      <footer className="panel-alt">
        {aktifBolge && (
          <p>
            {kapsamMetni(aktifBolge)}.
            {aktifBolge.gozlem_sayisi.unknown + aktifBolge.gozlem_sayisi.not_applicable > 0 && (
              <span className="ikincil-metin">
                {' '}
                {aktifBolge.gozlem_sayisi.unknown} belirsiz · {aktifBolge.gozlem_sayisi.not_applicable} kapsam dışı
              </span>
            )}
          </p>
        )}
        <div className="panel-alt-dugmeler">
          {aktifBolge && g && (
            <button
              type="button"
              className="baglanti"
              onClick={() => setBuyutec({ kutu: aktifBolge.kutu, ad: aktifBolge.ad })}
            >
              Bölümü %100 incele
            </button>
          )}
          {!sabit && <span className="ipucu">Sabitlemek için bölüme tıklayın</span>}
        </div>
      </footer>
    </div>
  );

  return (
    <div className="rapor">
      <header className="rapor-ust">
        <div>
          <h1>{rapor.yakalama.kurum}</h1>
          <p className="alt-satir">
            <a href={rapor.yakalama.url} target="_blank" rel="noreferrer noopener">
              {rapor.yakalama.url}
            </a>{' '}
            · yakalandı {tarih(rapor.yakalama.alindi_at)}
          </p>
          <p className="kohort">
            Kohort: {k.sektor} · {k.sayfa_turu_ad} · {k.viewport === 'mobil' ? 'mobil' : 'masaüstü'} · {k.ulke} ·{' '}
            {k.kurum_sayisi} kurum
          </p>
          {surum.donduruldu_at && (
            <p className="kohort">
              Benchmark {surum.surum} · donduruldu {tarih(surum.donduruldu_at)}
              {surum.onaylayan ? ` · onaylayan: ${surum.onaylayan}` : ''}
            </p>
          )}
        </div>
        <p className="okuma-notu">
          Bu rapor <strong>yaygınlığı</strong> gösterir: kohorttaki kurumların bir ölçütü nasıl uyguladığını.
          “İyi” veya “kötü” hükmü vermez.
        </p>
      </header>

      <div className="seritler" role="status">
        {surum.durum === 'taslak' && (
          <p className="serit">
            Deneme kohortu: bu rapor dondurulmuş bir benchmark sürümüne bağlı değil. Sonuçlar yayın için değildir.
          </p>
        )}
        {surum.durum === 'arsiv' && (
          <p className="serit">
            Bu rapor {surum.surum} sürümüne göre üretildi
            {surum.donduruldu_at ? ` (${tarih(surum.donduruldu_at)})` : ''}.
            {surum.guncel_surum ? ` Güncel sürüm ${surum.guncel_surum}.` : ''}
          </p>
        )}
        {!rapor.yakalama.kalite_gecti && (
          <p className="serit">
            Bu yakalama kalite kapısından geçmedi; sonuçlar yayınlanamaz. Tüm ölçütler “belirsiz” gösteriliyor.
          </p>
        )}
        {azOrnek && (
          <p className="serit">
            Bu kohortta karşılaştırılabilir kurum sayısı az (en fazla {enBuyukPayda}). Yüzde gösterilmiyor; ham
            sayılar gösteriliyor.
          </p>
        )}
        {bolgeler.length === 0 && (
          <p className="serit">
            Sayfa bölümlere ayrılamadı. Tüm ölçütler “Sayfa geneli” listesinde.
          </p>
        )}
      </div>

      <div className={`rapor-govde${ornekKodu ? ' levha-acik' : ''}`}>
        <section className="goruntu-sutunu" ref={setSutun} aria-label="Sayfa görüntüsü ve bölümler">
          <div className="arac-cubugu">
            <span>
              {dokunmatik || dar
                ? 'Bir bölüme dokunun.'
                : 'Bir bölümün üstüne gelin; sabitlemek için tıklayın. Tab ile bölümler arasında dolaşabilirsiniz.'}
            </span>
            {g && (
              <button type="button" className="ikincil" onClick={() => setBuyutec({ kutu: null, ad: null })}>
                %100 yakınlaştır
              </button>
            )}
          </div>
          {g ? (
            <figure className="sayfa">
              <img
                src={g.url}
                alt={`${rapor.yakalama.kurum} sayfasının tam görüntüsü`}
                width={g.w}
                height={g.h}
                decoding="async"
              />
              <div className="bolge-katmani">
                {bolgeler.map((b) => {
                  const etkin = acik && aktif === b.id;
                  const refProps = getReferenceProps({
                    onPointerEnter(e) {
                      if (sabit || e.pointerType !== 'mouse') return;
                      const el = e.currentTarget as HTMLElement;
                      window.clearTimeout(gecis.current);
                      gecis.current = window.setTimeout(
                        () => {
                          refs.setReference(el);
                          setAktif(b.id);
                          setHoverAdayi({ el });
                        },
                        acik ? 120 : 0,
                      );
                    },
                    onPointerLeave() {
                      window.clearTimeout(gecis.current);
                    },
                    onClick(e) {
                      ac(b.id, e.currentTarget as HTMLElement, false);
                    },
                    onKeyDown(e) {
                      bolgeTusu(e as KeyboardEvent<HTMLDivElement>, b);
                    },
                  });
                  return (
                    <div
                      key={b.id}
                      {...refProps}
                      ref={(el) => {
                        if (el) bolgeRefleri.current.set(b.id, el);
                        else bolgeRefleri.current.delete(b.id);
                      }}
                      role="button"
                      tabIndex={0}
                      aria-label={`${b.ad} bölümü`}
                      aria-expanded={etkin}
                      aria-haspopup="dialog"
                      data-bolge={b.id}
                      className={[
                        'bolge',
                        etkin ? 'etkin' : '',
                        b.kapsam.gecerli === 0 && b.gozlem_sayisi.not_applicable === 0 ? 'soluk' : '',
                        b.kaynak === 'ocr' ? 'kesik' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      style={{
                        left: yuzde(b.kutu.x, g.w),
                        top: yuzde(b.kutu.y, g.h),
                        width: yuzde(b.kutu.w, g.w),
                        height: yuzde(b.kutu.h, g.h),
                        zIndex: zSirasi.get(b.id),
                      }}
                    >
                      <span className="bolge-etiketi" aria-hidden="true">
                        {b.ad}
                      </span>
                    </div>
                  );
                })}
                {kanitKutusu && (
                  <div
                    ref={kanitRef}
                    className="kanit-cercevesi"
                    aria-hidden="true"
                    style={{
                      left: yuzde(kanitKutusu.x, g.w),
                      top: yuzde(kanitKutusu.y, g.h),
                      width: yuzde(kanitKutusu.w, g.w),
                      height: yuzde(kanitKutusu.h, g.h),
                    }}
                  />
                )}
              </div>
            </figure>
          ) : (
            <p className="bos">Bu yakalamanın görüntüsü yok.</p>
          )}
        </section>

        <nav className="bolum-listesi" aria-label="Bölümler">
          <h2>Bölümler</h2>
          <ol>
            {olcutlu.map((b) => (
              <li key={b.id}>{listeDugmesi(b)}</li>
            ))}
            <li className="genel">
              <button
                type="button"
                ref={genelRef}
                className={acik && aktif === GENEL ? 'secili' : undefined}
                onClick={() => listedenAc(GENEL)}
              >
                <span className="liste-ad">Sayfa geneli</span>
                <span className="liste-tur">görüntüde bir bölüme bağlanmayan</span>
                <span className="liste-kapsam">{genelGozlemler.length} ölçüt</span>
              </button>
            </li>
          </ol>
          {olcutsuz.length > 0 && (
            <details className="olcutsuz">
              <summary>Ölçüt bağlanmamış bölümler ({olcutsuz.length})</summary>
              <ol>
                {olcutsuz.map((b) => (
                  <li key={b.id}>{listeDugmesi(b)}</li>
                ))}
              </ol>
            </details>
          )}
          <p className="liste-notu">
            Sayılar <strong>kapsam</strong>dır: bölümdeki geçerli ölçütlerden kaçında “var” çıktığı. Kapsam
            dışı ölçütler paydaya girmez.
          </p>
        </nav>
      </div>

      {panelIcerigi &&
        (sabit ? (
          <FloatingFocusManager context={context} modal={false} initialFocus={-1} returnFocus closeOnFocusOut={false}>
            {panelIcerigi}
          </FloatingFocusManager>
        ) : (
          panelIcerigi
        ))}

      {ornekKodu && (
        <DigerOrnekler
          surumId={surum.id}
          haricKurumId={raporId.split('~')[1] ?? ''}
          gozlemler={rapor.gozlemler}
          baslangicKodu={ornekKodu}
          onKapat={() => setOrnekKodu(null)}
        />
      )}

      {buyutec && g && (
        <Buyutec
          goruntuUrl={g.url}
          w={g.w}
          h={g.h}
          odak={buyutec.kutu}
          odakAdi={buyutec.ad}
          onKapat={() => setBuyutec(null)}
        />
      )}
    </div>
  );
}
