'use client';

// OTOMATİK KOPYA — benchmark-collector/web/src/Kirpim.tsx (scripts/hub-esitle.ts). Burada düzenlemeyin.
/**
 * CSS kırpımı (docs/09 §4.3) — Lighthouse'un öğe ekran görüntüsü yöntemi
 * (report/renderer/element-screenshot-renderer.js):
 *
 *   - Sunucuda kırpma yok. Tam sayfa PNG bir kez indirilir; her kırpım aynı
 *     görüntüyü `background-position` ile kaydırır.
 *   - Yakınlaştırma çarpanı 1'i geçmez: küçük bölge büyütülmez (bulanıklaşmaz),
 *     büyük bölge sığacak kadar küçültülür (`_computeZoomFactor`).
 *   - Görüntü kart görünür alana girince atanır (IntersectionObserver, §7.4);
 *     tam sayfa PNG'ler peşin indirilmez.
 */
import { useEffect, useRef, useState } from 'react';
import type { Kutu } from '@/lib/kanitli/rapor-sozlesmesi';

interface Ozellikler {
  goruntuUrl: string;
  goruntuW: number;
  goruntuH: number;
  kutu: Kutu;
  hedefGenislik: number;
  azamiYukseklik: number;
  /** Kırpım içinde kesik çizgiyle işaretlenecek kanıt kutusu (sayfa koordinatında). */
  kanitKutusu?: Kutu | null;
  etiket: string;
}

export function Kirpim(p: Ozellikler) {
  const ref = useRef<HTMLDivElement>(null);
  const [gorunur, setGorunur] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || gorunur) return;
    if (typeof IntersectionObserver === 'undefined') {
      setGorunur(true);
      return;
    }
    const gozcu = new IntersectionObserver(
      (girdiler) => {
        if (girdiler.some((g) => g.isIntersecting)) {
          setGorunur(true);
          gozcu.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    gozcu.observe(el);
    return () => gozcu.disconnect();
  }, [gorunur]);

  const olcek = Math.min(1, p.hedefGenislik / p.kutu.w, p.azamiYukseklik / p.kutu.h);
  const w = Math.round(p.kutu.w * olcek);
  const h = Math.round(p.kutu.h * olcek);

  const k = p.kanitKutusu;
  const kanitIcerde =
    k && k.x + k.w > p.kutu.x && k.x < p.kutu.x + p.kutu.w && k.y + k.h > p.kutu.y && k.y < p.kutu.y + p.kutu.h;

  return (
    <div
      ref={ref}
      className="kirpim"
      role="img"
      aria-label={p.etiket}
      style={{
        width: w,
        height: h,
        backgroundImage: gorunur ? `url("${p.goruntuUrl}")` : undefined,
        backgroundSize: `${p.goruntuW * olcek}px ${p.goruntuH * olcek}px`,
        backgroundPosition: `${-p.kutu.x * olcek}px ${-p.kutu.y * olcek}px`,
      }}
    >
      {kanitIcerde && k && (
        <span
          className="kirpim-kanit"
          style={{
            left: (k.x - p.kutu.x) * olcek - 3,
            top: (k.y - p.kutu.y) * olcek - 3,
            width: k.w * olcek + 6,
            height: k.h * olcek + 6,
          }}
        />
      )}
    </div>
  );
}
