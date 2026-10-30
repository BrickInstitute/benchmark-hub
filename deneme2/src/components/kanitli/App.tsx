'use client';

// OTOMATİK KOPYA — benchmark-collector/web/src/App.tsx (scripts/hub-esitle.ts). Burada düzenlemeyin.
import { useEffect, useState } from 'react';
import type { RaporGovdesi, RaporListesiOgesi } from '@/lib/kanitli/rapor-sozlesmesi';
import { raporGetir, raporlariGetir } from './api';
import { RaporGorunumu } from './RaporGorunumu';

/** Rapor kimliği adres çubuğunda tutulur: bağlantı paylaşılabilir, geri tuşu çalışır. */
function adrestekiRapor(): string | null {
  return new URLSearchParams(window.location.search).get('rapor');
}

/** Başka bir uygulamaya gömülünce (UI Benchmark Hub) üst çubukta dönüş bağlantısı. */
export interface UygulamaOzellikleri {
  geri?: { href: string; etiket: string };
}

export function App({ geri }: UygulamaOzellikleri = {}) {
  const [liste, setListe] = useState<RaporListesiOgesi[] | null>(null);
  const [secili, setSecili] = useState<string | null>(adrestekiRapor);
  const [rapor, setRapor] = useState<RaporGovdesi | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  useEffect(() => {
    raporlariGetir()
      .then((l) => {
        setListe(l);
        setSecili((s) => s ?? l[0]?.id ?? null);
      })
      .catch((e: Error) => setHata(e.message));
    const geri = () => setSecili(adrestekiRapor());
    window.addEventListener('popstate', geri);
    return () => window.removeEventListener('popstate', geri);
  }, []);

  useEffect(() => {
    if (!secili) return;
    let iptal = false;
    setRapor(null);
    setHata(null);
    raporGetir(secili)
      .then((r) => !iptal && setRapor(r))
      .catch((e: Error) => !iptal && setHata(e.message));
    return () => {
      iptal = true;
    };
  }, [secili]);

  const sec = (id: string) => {
    const u = new URL(window.location.href);
    u.searchParams.set('rapor', id);
    window.history.pushState(null, '', u);
    setSecili(id);
  };

  const gruplar = new Map<string, RaporListesiOgesi[]>();
  for (const r of liste ?? []) {
    const surum = r.surum_durumu === 'taslak' ? 'taslak' : `${r.surum}${r.surum_durumu === 'arsiv' ? ' · arşiv' : ''}`;
    const anahtar = `${r.sektor} · ${r.viewport === 'mobil' ? 'mobil' : 'masaüstü'} · ${surum}`;
    gruplar.set(anahtar, [...(gruplar.get(anahtar) ?? []), r]);
  }

  return (
    <div className="uygulama kanitli-kok">
      <header className="ust-cubuk">
        <span className="marka">
          {geri && (
            <a className="geri" href={geri.href}>
              ← {geri.etiket}
            </a>
          )}
          Kanıtlı benchmark raporu
        </span>
        {liste && liste.length > 0 && (
          <label>
            <span className="gorsel-gizli">Rapor seç</span>
            <select value={secili ?? ''} onChange={(e) => sec(e.target.value)}>
              {[...gruplar].map(([grup, raporlar]) => (
                <optgroup key={grup} label={grup}>
                  {raporlar.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.kurum}
                      {r.kalite_gecti ? '' : ' (kaliteden kaldı)'}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        )}
      </header>
      <main>
        {hata && <p className="hata">Rapor yüklenemedi: {hata}</p>}
        {liste && liste.length === 0 && (
          <div className="bos-durum">
            <h1>Henüz yayınlanmış rapor yok</h1>
            <p>
              Raporlar bir kohort yakalanıp yayınlandığında burada görünür
              (benchmark-collector: <code>npm run e2e</code>, ardından <code>scripts/hub-yayinla.ts</code>).
            </p>
          </div>
        )}
        {!rapor && !hata && liste && liste.length > 0 && <p className="yukleniyor">Rapor yükleniyor…</p>}
        {rapor && secili && <RaporGorunumu rapor={rapor} raporId={secili} />}
      </main>
    </div>
  );
}
