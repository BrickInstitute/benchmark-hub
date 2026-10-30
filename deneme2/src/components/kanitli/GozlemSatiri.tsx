'use client';

// OTOMATİK KOPYA — benchmark-collector/web/src/GozlemSatiri.tsx (scripts/hub-esitle.ts). Burada düzenlemeyin.
/**
 * Panelde bir ölçüt (docs/09 §6.2).
 *
 * Kurallar:
 *   - Merdiven yalnız sıralı kalıplarda (P2–P5). P1 rozet, P6 sayı + kova,
 *     P7 etiket listesi.
 *   - `unknown` ASLA "yok" gibi görünmez: ayrı rozet + sebep.
 *   - payda < 8 → hiçbir yerde yüzde yok.
 */
import type { Kutu, RaporGozlemi } from '@/lib/kanitli/rapor-sozlesmesi';
import { birimli, degerAdi, DURUM_ROZETI, SIRALI } from './metin';

interface Ozellikler {
  g: RaporGozlemi;
  kurumSayisi: number;
  onKanitGoster: (k: Kutu) => void;
  onOrnekler: (g: RaporGozlemi) => void;
}

function Merdiven({ g }: { g: RaporGozlemi }) {
  const basamaklar = g.basamaklar;
  return (
    <div className="merdiven" aria-label={`Basamaklar: ${basamaklar.map(degerAdi).join(', ')}`}>
      <ol>
        {basamaklar.map((b, i) => {
          const siz = i === g.deger_sirasi;
          return (
            <li key={b} className={siz ? 'siz' : undefined} aria-current={siz ? 'true' : undefined}>
              <span className="nokta" aria-hidden="true" />
              <span className="ad">{degerAdi(b)}</span>
              {siz && <span className="siz-etiket">sizin sayfanız</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Deger({ g }: { g: RaporGozlemi }) {
  if (g.status === 'unknown' || g.status === 'not_applicable') return null;
  if (SIRALI.has(g.pattern)) return <Merdiven g={g} />;
  if (g.pattern === 'P6') {
    return (
      <p className="deger-satiri">
        {g.ham_sayi !== null ? <strong>{birimli(g.criterion_kod, g.ham_sayi)}</strong> : null}
        {g.deger && g.deger !== 'yok' ? <span className="kova">kova: {degerAdi(g.deger)}</span> : null}
        {g.deger === 'yok' ? <span className="kova">hiç yok</span> : null}
      </p>
    );
  }
  if (g.pattern === 'P7') {
    const etiketler = (g.deger ?? '').split('+').filter((x) => x && x !== 'yok');
    return (
      <ul className="etiketler">
        {etiketler.length ? etiketler.map((e) => <li key={e}>{degerAdi(e)}</li>) : <li>hiçbiri</li>}
      </ul>
    );
  }
  return null;
}

function DagilimTablosu({ g, kurumSayisi }: { g: RaporGozlemi; kurumSayisi: number }) {
  const d = g.dagilim;
  if (d.payda === 0) {
    return <p className="not">Bu ölçüt kohortta hiçbir kurumda ölçülemedi.</p>;
  }
  const enCok = Math.max(1, ...d.satirlar.map((s) => s.adet));
  return (
    <div className="dagilim">
      <p className="dagilim-baslik">
        Kohortta ({kurumSayisi} kurum, karşılaştırılabilir {d.payda}):
      </p>
      <table>
        <tbody>
          {d.satirlar.map((s) => {
            const siz = s.deger === g.deger && (g.status === 'present' || g.status === 'absent');
            return (
              <tr key={s.deger} className={siz ? 'siz' : undefined}>
                <th scope="row">{degerAdi(s.deger)}</th>
                <td className="cubuk-hucre">
                  <span
                    className={s.adet === 0 ? 'cubuk sifir' : 'cubuk'}
                    style={{ width: `${(s.adet / enCok) * 100}%` }}
                  />
                </td>
                <td className="sayi">
                  {s.adet}
                  {s.yuzde !== null ? <span className="yuzde"> · %{s.yuzde}</span> : null}
                </td>
                <td className="siz-hucre">{siz ? '← siz' : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {(d.haric_tutulan.unknown > 0 || d.haric_tutulan.not_applicable > 0) && (
        <p className="not">
          {[
            d.haric_tutulan.unknown > 0 ? `${d.haric_tutulan.unknown} kurum belirsiz` : null,
            d.haric_tutulan.not_applicable > 0 ? `${d.haric_tutulan.not_applicable} kurum kapsam dışı` : null,
          ]
            .filter(Boolean)
            .join(', ')}{' '}
          — bunlar karşılaştırmaya girmedi.
        </p>
      )}
      {d.uyari === 'ornek_az' && (
        <p className="not">Karşılaştırılabilir kurum sayısı az ({d.payda}); yüzde gösterilmiyor.</p>
      )}
      {d.ayrim_yok && <p className="not">Bu ölçüt kohortta ayrım yaratmıyor: hepsi aynı basamakta.</p>}
    </div>
  );
}

export function GozlemSatiri({ g, kurumSayisi, onKanitGoster, onOrnekler }: Ozellikler) {
  return (
    <article className={`gozlem durum-${g.status}`} aria-labelledby={`${g.id}-soru`}>
      <header>
        <h4 id={`${g.id}-soru`}>
          <span className="kod">{g.criterion_kod}</span> {g.criterion_soru}
        </h4>
        <span className={`rozet rozet-${g.status}`}>{DURUM_ROZETI[g.status]}</span>
      </header>

      {g.status === 'unknown' && (
        <p className="sebep">
          <strong>Belirsiz, "yok" değil.</strong> {g.sebep ?? 'Sebep kaydedilmemiş.'}
        </p>
      )}
      {g.status === 'not_applicable' && (
        <p className="sebep">
          Bu sayfada geçerli değil{g.sebep ? `: ${g.sebep}` : '.'}
          {g.na_kosulu ? <span className="na-kosulu"> Katalog koşulu: {g.na_kosulu}</span> : null}
        </p>
      )}

      <Deger g={g} />

      {g.kanit && (
        <div className="kanit">
          <p>
            Kanıt: <q>{g.kanit.metin.length > 140 ? g.kanit.metin.slice(0, 140) + '…' : g.kanit.metin}</q>
            <span className="kanit-kaynak">
              {g.kanit.kaynak === 'dom_ogesi' ? ' · DOM öğesi' : ' · model alıntısı, DOM\'da doğrulandı'}
            </span>
          </p>
          {g.kanit.belirsiz && (
            <p className="uyari-satir">Bu metin sayfada birden çok yerde geçiyor; kutu kesin değil.</p>
          )}
          {g.kanit.kutu && (
            <button type="button" className="baglanti" onClick={() => onKanitGoster(g.kanit!.kutu!)}>
              Kanıtı görüntüde göster
            </button>
          )}
        </div>
      )}

      {g.status !== 'not_applicable' && <DagilimTablosu g={g} kurumSayisi={kurumSayisi} />}

      {g.status !== 'not_applicable' && (
        <button
          type="button"
          className="ikincil"
          onClick={() => onOrnekler(g)}
          disabled={g.ornek_sayisi === 0}
          title={g.ornek_sayisi === 0 ? 'Gösterilebilir doğrulanmış örnek yok' : undefined}
        >
          Diğer örnekler ({g.ornek_sayisi})
        </button>
      )}
    </article>
  );
}
