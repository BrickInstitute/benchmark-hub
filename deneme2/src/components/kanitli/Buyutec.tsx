'use client';

// OTOMATİK KOPYA — benchmark-collector/web/src/Buyutec.tsx (scripts/hub-esitle.ts). Burada düzenlemeyin.
/**
 * %100 yakınlaştırma (docs/09 §8 "Çok uzun sayfa").
 *
 * Görüntü kapsayıcıya sığdırılınca uzun sayfalardaki küçük bölgeler okunmaz.
 * Lighthouse'un ışık kutusu yaklaşımı + react-zoom-pan-pinch: kaydır, yakınlaştır,
 * mini harita. Yalnız KULLANICININ KENDİ yakalaması için açılır — rakip
 * sayfaların tam görüntüsü gösterilmez (docs/07 §3).
 */
import { useEffect, useRef } from 'react';
import { MiniMap, TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';
import type { Kutu } from '@/lib/kanitli/rapor-sozlesmesi';

interface Ozellikler {
  goruntuUrl: string;
  w: number;
  h: number;
  odak: Kutu | null;
  odakAdi: string | null;
  onKapat: () => void;
}

export function Buyutec({ goruntuUrl, w, h, odak, odakAdi, onKapat }: Ozellikler) {
  const isaretRef = useRef<HTMLDivElement>(null);
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
    <div className="buyutec" role="dialog" aria-modal="true" aria-label="Görüntüyü %100 boyutta incele">
      <TransformWrapper
        initialScale={1}
        minScale={0.08}
        maxScale={2}
        limitToBounds
        doubleClick={{ disabled: true }}
        wheel={{ step: 0.12 }}
        onInit={(ref) => {
          if (isaretRef.current) ref.zoomToElement(isaretRef.current, 1, 0);
        }}
      >
        {({ zoomIn, zoomOut, setTransform, zoomToElement, fitToView }) => (
          <>
            <div className="buyutec-arac">
              <span className="buyutec-baslik">{odakAdi ? `${odakAdi} · ` : ''}%100 inceleme</span>
              <button type="button" onClick={() => zoomOut()}>−</button>
              <button type="button" onClick={() => zoomIn()}>+</button>
              <button
                type="button"
                onClick={() =>
                  isaretRef.current ? zoomToElement(isaretRef.current, 1, 200) : setTransform(0, 0, 1)
                }
              >
                %100
              </button>
              <button type="button" onClick={() => fitToView()}>Sığdır</button>
              <button type="button" ref={kapatRef} onClick={onKapat} aria-label="Kapat">
                ×
              </button>
            </div>
            <div className="buyutec-mini" aria-hidden="true">
              <MiniMap width={110} height={300} borderColor="#2563eb">
                <img src={goruntuUrl} alt="" style={{ width: w, height: h, display: 'block' }} />
              </MiniMap>
            </div>
            <TransformComponent wrapperClass="buyutec-alan" contentStyle={{ width: w, height: h }}>
              <div style={{ position: 'relative', width: w, height: h }}>
                <img src={goruntuUrl} alt="Yakalanan sayfanın tamamı" width={w} height={h} draggable={false} />
                <div
                  ref={isaretRef}
                  className="buyutec-odak"
                  style={
                    odak
                      ? { left: odak.x, top: odak.y, width: odak.w, height: odak.h }
                      : { left: 0, top: 0, width: Math.min(w, 1440), height: Math.min(h, 900), borderColor: 'transparent' }
                  }
                />
              </div>
            </TransformComponent>
          </>
        )}
      </TransformWrapper>
    </div>
  );
}
