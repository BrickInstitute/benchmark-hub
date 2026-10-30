"use client";

/**
 * Kanıtlı rapor (docs/09) — benchmark-collector'ın etkileşimli raporu.
 * Bileşenler src/components/kanitli/ altındadır ve scripts/hub-esitle.ts ile
 * kopyalanır; burada düzenlemeyin.
 *
 * Yalnız istemcide çizilir: rapor adres çubuğunu, matchMedia'yı ve görüntü
 * ölçülerini kullanır; giriş arkasında olduğu için sunucu çiziminin kazancı yok.
 */
import dynamic from "next/dynamic";
import "@/components/kanitli/stil.css";

const App = dynamic(() => import("@/components/kanitli/App").then((m) => m.App), {
  ssr: false,
  loading: () => <p style={{ padding: 24, color: "#6b7280" }}>Rapor yükleniyor…</p>,
});

export default function KanitliRaporSayfasi() {
  return <App geri={{ href: "/benchmarks", etiket: "UI Benchmark Hub" }} />;
}
