'use client';

// OTOMATİK KOPYA — benchmark-collector/web/src/DigerOrnekler.tsx (scripts/hub-esitle.ts). Burada düzenlemeyin.
/**
 * "Diğer örnekler" (docs/09 §7). Sağdan kayan levha; ana görüntü ve vurgulu
 * bölge ekranda kalır ki kullanıcı kendi sayfasıyla örnekleri yan yana görsün.
 *
 *   - Varsayılan sekme kullanıcının basamağı DEĞİL, ondan farklı olanların en
 *     kalabalığı: öğrenilecek şey alternatiftir (§7.3).
 *   - Kartta kurum, tarih ve kaynak URL zorunlu; tam sayfa görüntüsü yok (§7.2).
 *   - 6 kart, "daha fazla göster" ile 6'şar (§7.4).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Ornek, OrneklerYaniti, RaporGozlemi } from '@/lib/kanitli/rapor-sozlesmesi';
import { ornekleriGetir } from './api';
import { Kirpim } from './Kirpim';
import { degerAdi, tarih } from './metin';

interface Ozellikler {
  surumId: string;
  haricKurumId: string;
  gozlemler: RaporGozlemi[];
  baslangicKodu: string;
  onKapat: () => void;
}

export function DigerOrnekler({ surumId, haricKurumId, gozlemler, baslangicKodu, onKapat }: Ozellikler) {
  const [kod, setKod] = useState(baslangicKodu);
  const [sekme, setSekme] = useState<string | null | undefined>(undefined);
  const [yanit, setYanit] = useState<OrneklerYaniti | null>(null);
  const [kartlar, setKartlar] = useState<Ornek[]>([]);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const baslikRef = useRef<HTMLHeadingElement>(null);
  const [buyuk, setBuyuk] = useState<Ornek | null>(null);

  useEffect(() => setKod(baslangicKodu), [baslangicKodu]);
  useEffect(() => baslikRef.current?.focus(), []);

  // Sekme sayıları ve kullanıcının değeri için önce filtresiz sorgu.
  useEffect(() => {
    let iptal = false;
    setYanit(null);
    setSekme(undefined);
    ornekleriGetir({ benchmark_surum_id: surumId, criterion_kod: kod, haric_kurum_id: haricKurumId, limit: 1 })
      .then((y) => {
        if (iptal) return;
        setYanit(y);
        const farkli = y.basamak_sayilari
          .filter((b) => b.adet > 0 && b.deger !== y.kullanicinin_degeri)
          .sort((a, b) => b.adet - a.adet)[0];
        setSekme(farkli ? farkli.deger : null);
      })
      .catch((e: Error) => !iptal && setHata(e.message));
    return () => {
      iptal = true;
    };
  }, [kod, surumId, haricKurumId]);

  const [imlec, setImlec] = useState<string | null>(null);
  useEffect(() => {
    if (sekme === undefined) return;
    let iptal = false;
    setYukleniyor(true);
    setKartlar([]);
    ornekleriGetir({
      benchmark_surum_id: surumId,
      criterion_kod: kod,
      haric_kurum_id: haricKurumId,
      deger: sekme,
      limit: 6,
    })
      .then((y) => {
        if (iptal) return;
        setKartlar(y.ornekler);
        setImlec(y.sonraki_imlec);
      })
      .catch((e: Error) => !iptal && setHata(e.message))
      .finally(() => !iptal && setYukleniyor(false));
    return () => {
      iptal = true;
    };
  }, [sekme, kod, surumId, haricKurumId]);

  const dahaFazla = () => {
    if (!imlec) return;
    setYukleniyor(true);
    ornekleriGetir({
      benchmark_surum_id: surumId,
      criterion_kod: kod,
      haric_kurum_id: haricKurumId,
      deger: sekme ?? null,
      limit: 6,
      imlec,
    })
      .then((y) => {
        setKartlar((k) => [...k, ...y.ornekler]);
        setImlec(y.sonraki_imlec);
      })
      .catch((e: Error) => setHata(e.message))
      .finally(() => setYukleniyor(false));
  };

  const toplam = useMemo(
    () => (yanit ? yanit.basamak_sayilari.reduce((t, b) => t + b.adet, 0) : 0),
    [yanit],
  );
  const gozlem = gozlemler.find((g) => g.criterion_kod === kod);
  const sayfaliOlcutler = gozlemler.filter((g) => g.status !== 'not_applicable');

  return (
    <aside className="levha" role="dialog" aria-modal="false" aria-labelledby="ornek-baslik">
      <header className="levha-ust">
        <div>
          <h2 id="ornek-baslik" tabIndex={-1} ref={baslikRef}>
            Diğer örnekler
          </h2>
          <p className="alt-satir">
            Aynı kohortta, aynı ölçütte başka kurumlar. Yalnız doğrulanmış kanıtı olanlar gösterilir.
          </p>
        </div>
        <button type="button" className="kapat" onClick={onKapat} aria-label="Örnekleri kapat">
          ×
        </button>
      </header>

      {sayfaliOlcutler.length > 1 && (
        <label className="olcut-secici">
          Ölçüt
          <select value={kod} onChange={(e) => setKod(e.target.value)}>
            {sayfaliOlcutler.map((g) => (
              <option key={g.criterion_kod} value={g.criterion_kod}>
                {g.criterion_kod} — {g.criterion_soru} ({g.ornek_sayisi})
              </option>
            ))}
          </select>
        </label>
      )}

      {gozlem && sayfaliOlcutler.length <= 1 && (
        <p className="olcut-adi">
          <span className="kod">{gozlem.criterion_kod}</span> {gozlem.criterion_soru}
        </p>
      )}

      {yanit && (
        <div className="sekmeler" role="tablist" aria-label="Basamağa göre süz">
          <button
            type="button"
            role="tab"
            aria-selected={sekme === null}
            onClick={() => setSekme(null)}
          >
            Hepsi ({toplam})
          </button>
          {yanit.basamak_sayilari.map((b) => {
            const siz = b.deger === yanit.kullanicinin_degeri;
            return (
              <button
                key={b.deger}
                type="button"
                role="tab"
                aria-selected={sekme === b.deger}
                onClick={() => setSekme(b.deger)}
                className={siz ? 'siz' : undefined}
                disabled={b.adet === 0 && !siz}
              >
                {degerAdi(b.deger)} ({b.adet}){siz ? ' · siz buradasınız' : ''}
              </button>
            );
          })}
        </div>
      )}

      {hata && <p className="uyari-satir">Örnekler yüklenemedi: {hata}</p>}

      <div className="kartlar" aria-busy={yukleniyor}>
        {kartlar.map((o) => {
          // Geniş ve basık bölgeler (menü, şerit) dar kartta okunmaz: tam satır.
          const genis = o.kirpim.kutu.w / o.kirpim.kutu.h > 3.2;
          return (
          <figure className={genis ? 'ornek-karti genis-kart' : 'ornek-karti'} key={o.capture_id}>
            <button
              type="button"
              className="kirpim-dugmesi"
              onClick={() => setBuyuk(o)}
              aria-label={`${o.kurum} kırpımını büyüt`}
            >
              <Kirpim
                goruntuUrl={o.kirpim.goruntu_url}
                goruntuW={o.kirpim.goruntu_w}
                goruntuH={o.kirpim.goruntu_h}
                kutu={o.kirpim.kutu}
                hedefGenislik={genis ? 500 : 236}
                azamiYukseklik={genis ? 160 : 220}
                kanitKutusu={o.kanit_kutusu}
                etiket={`${o.kurum}: ilgili bölümün kırpımı`}
              />
            </button>
            <figcaption>
              <div className="kart-ust">
                <strong>{o.kurum}</strong>
                <span className="deger-rozeti">{degerAdi(o.deger)}</span>
              </div>
              <div className="kart-meta">
                {tarih(o.alindi_at)} ·{' '}
                <a href={o.kaynak_url} target="_blank" rel="noreferrer noopener">
                  kaynak sayfa ↗
                </a>
              </div>
              {o.kanit_metni && (
                <q className="kart-kanit">
                  {o.kanit_metni.length > 90 ? o.kanit_metni.slice(0, 90) + '…' : o.kanit_metni}
                </q>
              )}
            </figcaption>
          </figure>
          );
        })}
      </div>

      {!yukleniyor && yanit && kartlar.length === 0 && (
        <p className="bos">
          {sekme === 'yok'
            ? 'Bu basamakta gösterilebilir örnek yok: bir şeyin yokluğu kırpımla kanıtlanamaz.'
            : 'Bu ölçüt için gösterilebilir doğrulanmış örnek yok. Kanıtı doğrulanamayan gözlemler örnek olarak gösterilmez.'}
        </p>
      )}
      {yukleniyor && <p className="bos">Yükleniyor…</p>}
      {buyuk && <KirpimBuyutme ornek={buyuk} onKapat={() => setBuyuk(null)} />}
      {imlec && !yukleniyor && (
        <button type="button" className="ikincil genis" onClick={dahaFazla}>
          Daha fazla göster
        </button>
      )}
    </aside>
  );
}

/**
 * Kırpımı büyük gösterir. Yine YALNIZ kırpım: rakip sayfanın tam görüntüsü
 * gösterilmez (docs/07 §3). Yakınlaştırma 1'i geçmez; piksel uydurulmaz.
 */
function KirpimBuyutme({ ornek, onKapat }: { ornek: Ornek; onKapat: () => void }) {
  const kapatRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    kapatRef.current?.focus();
    const tus = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onKapat();
      }
    };
    window.addEventListener('keydown', tus, true);
    return () => window.removeEventListener('keydown', tus, true);
  }, [onKapat]);
  return (
    <div className="kirpim-buyut" data-esc-oncelikli role="dialog" aria-modal="true" aria-label={`${ornek.kurum} kırpımı`} onClick={onKapat}>
      <figure onClick={(e) => e.stopPropagation()}>
        <Kirpim
          goruntuUrl={ornek.kirpim.goruntu_url}
          goruntuW={ornek.kirpim.goruntu_w}
          goruntuH={ornek.kirpim.goruntu_h}
          kutu={ornek.kirpim.kutu}
          hedefGenislik={Math.min(window.innerWidth * 0.9, 1280)}
          azamiYukseklik={window.innerHeight * 0.75}
          kanitKutusu={ornek.kanit_kutusu}
          etiket={`${ornek.kurum}: ilgili bölümün kırpımı`}
        />
        <figcaption>
          <strong>{ornek.kurum}</strong> · {degerAdi(ornek.deger)} · {tarih(ornek.alindi_at)} ·{' '}
          <a href={ornek.kaynak_url} target="_blank" rel="noreferrer noopener">kaynak sayfa ↗</a>
          <button type="button" className="kapat" ref={kapatRef} onClick={onKapat} aria-label="Kapat">×</button>
        </figcaption>
      </figure>
    </div>
  );
}
