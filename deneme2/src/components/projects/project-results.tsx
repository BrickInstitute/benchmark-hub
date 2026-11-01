"use client";

import Link from "next/link";
import useSWR from "swr";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { fetcher } from "./shared";

interface PrevalenceRow {
  key: string;
  label: string;
  description: string;
  count: number;
  percent: number | null;
  institutions: string[];
  medianPosition: number | null;
  examples: Array<{ institution: string; text: string }>;
}

interface Summary {
  coverage: { included: number; analyzed: number; failed: number; pending: number; percent: number | null };
  percentagesWithheld: boolean;
  minDenominator: number;
  modules: PrevalenceRow[];
  valueThemes: PrevalenceRow[];
  heroVisuals: Array<{ key: string; label: string; count: number }>;
  heroes: Array<{
    targetId: string;
    institution: string;
    url: string | null;
    benchmarkId: string;
    foldImage: string | null;
    headline: string | null;
    subheadline: string | null;
    ctas: string[];
    visual: string | null;
    visualLabel: string | null;
    firstScreenValueProps: Array<{ text: string; theme: string | null }>;
    modules: Array<{ type: string; label: string; title: string | null }>;
    unverifiedCount: number;
  }>;
  criteria: Array<{
    code: string;
    question: string;
    pattern: string;
    denominator: number;
    rows: Array<{ value: string; count: number; percent: number | null }>;
    excluded: { unknown: number; notApplicable: number };
  }>;
  health: { verifiedElements: number; unverifiedElements: number };
}

function Share({ count, percent, total }: { count: number; percent: number | null; total: number }) {
  return (
    <span className="tabular-nums">
      <span className="text-ink font-medium">{count}</span>
      <span className="text-muted">/{total}</span>
      {percent !== null && <span className="text-ink-2 ml-1">(%{percent})</span>}
    </span>
  );
}

function Bar({ count, total }: { count: number; total: number }) {
  const w = total ? Math.round((count / total) * 100) : 0;
  return (
    <div className="h-1.5 w-full bg-surface-3 rounded">
      <div className="h-1.5 bg-brand-400 rounded" style={{ width: `${w}%` }} />
    </div>
  );
}

export function ProjectResults({ projectId, refreshKey }: { projectId: string; refreshKey: string }) {
  const { data, isLoading } = useSWR<Summary>(`/api/projects/${projectId}/summary?k=${refreshKey}`, fetcher);

  if (isLoading || !data) return <Skeleton className="h-64 w-full rounded-xl" />;
  const n = data.coverage.analyzed;

  if (n === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted">
          Henüz analizi tamamlanmış site yok. Site listesinde &quot;Analizi başlat&quot; ile çalıştırın.
          {data.criteria.length > 0 && " (Yalnızca yakalama yapılmış siteler aşağıda ölçüt tablosunda görünür.)"}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap gap-6 text-sm">
          <div>
            <div className="text-xs text-muted">Analiz edilen</div>
            <div className="text-ink font-semibold text-lg">
              {n} / {data.coverage.included} site
              {data.coverage.percent !== null && <span className="text-sm text-muted ml-1">(%{data.coverage.percent} kapsam)</span>}
            </div>
          </div>
          {data.coverage.failed > 0 && (
            <div>
              <div className="text-xs text-muted">Başarısız</div>
              <div className="text-peach font-semibold text-lg">{data.coverage.failed}</div>
            </div>
          )}
          <div>
            <div className="text-xs text-muted">Doğrulanan / doğrulanamayan öğe</div>
            <div className="text-ink font-semibold text-lg">
              {data.health.verifiedElements} / <span className="text-sky">{data.health.unverifiedElements}</span>
            </div>
          </div>
          <p className="basis-full text-xs text-muted">
            Sayılar &quot;en az N sitede görüldü&quot; anlamındadır: bulunamayan bir modül, sayfada olmadığı anlamına
            gelmez. Modelin alıntısı sayfada bulunamayan öğeler hiçbir sayıya girmez.
            {data.percentagesWithheld &&
              ` ${data.minDenominator} siteden az analiz edildiği için yüzde gösterilmiyor, yalnızca sayılar.`}
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-ink">Modüller</h3>
            <p className="text-xs text-muted mt-1">Hangi bölüm kaç sitede var; tipik sırası (sayfadaki modüller arasında medyan konum).</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.modules.map((m) => (
              <div key={m.key} title={`${m.description}\n\n${m.institutions.join(", ")}`}>
                <div className="flex justify-between text-sm">
                  <span className="text-ink-2">
                    {m.label}
                    {m.medianPosition !== null && <span className="text-xs text-muted ml-2">#{m.medianPosition}</span>}
                  </span>
                  <Share count={m.count} percent={m.percent} total={n} />
                </div>
                <Bar count={m.count} total={n} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="font-semibold text-ink">Değer önerileri</h3>
            <p className="text-xs text-muted mt-1">Hangi vaat temasını kaç kurum kullanıyor; her kurumdan bir örnek.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.valueThemes.map((v) => (
              <div key={v.key}>
                <div className="flex justify-between text-sm" title={v.description}>
                  <span className="text-ink-2">{v.label}</span>
                  <Share count={v.count} percent={v.percent} total={n} />
                </div>
                <Bar count={v.count} total={n} />
                <ul className="mt-1.5 space-y-0.5">
                  {v.examples.slice(0, 4).map((ex) => (
                    <li key={ex.institution} className="text-xs text-muted">
                      <span className="text-ink-2">{ex.institution}:</span> &ldquo;{ex.text}&rdquo;
                    </li>
                  ))}
                  {v.examples.length > 4 && <li className="text-xs text-muted-2">+{v.examples.length - 4} kurum daha</li>}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <h3 className="font-semibold text-ink">Hero karşılaştırması</h3>
          <p className="text-xs text-muted mt-1">
            Başlık ve alt metin sayfadaki birebir metindir; düğmeler yazılımın ilk ekranda bulduğu ana eylem düğmeleridir.
            Görsel türü ekran görüntüsünden okunmuştur (metin kanıtı yoktur).
            {data.heroVisuals.length > 0 &&
              " Görsel dağılımı: " + data.heroVisuals.map((v) => `${v.label} ${v.count}`).join(", ") + "."}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.heroes.map((h) => (
            <div key={h.targetId} className="flex gap-4 border-t border-line pt-4 first:border-0 first:pt-0">
              <Link href={`/benchmarks/${h.benchmarkId}`} className="shrink-0">
                {h.foldImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/files/${h.foldImage}`} alt="" className="w-56 h-36 object-cover object-top rounded border border-line" />
                ) : (
                  <div className="w-56 h-36 rounded border border-dashed border-line" />
                )}
              </Link>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-ink">{h.institution}</span>
                  {h.visualLabel && <Badge>{h.visualLabel}</Badge>}
                  {h.unverifiedCount > 0 && (
                    <span className="text-xs text-sky" title="Modelin alıntısı sayfada bulunamadı; sayılmadı">
                      {h.unverifiedCount} doğrulanamayan öğe
                    </span>
                  )}
                </div>
                <p className="text-ink mt-1">{h.headline ?? <span className="text-muted text-sm">başlık doğrulanamadı</span>}</p>
                {h.subheadline && <p className="text-sm text-ink-2 mt-0.5">{h.subheadline}</p>}
                {h.ctas.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {h.ctas.map((c) => (
                      <span key={c} className="text-xs px-2 py-0.5 rounded border border-brand-700 text-brand-300">{c}</span>
                    ))}
                  </div>
                )}
                {h.firstScreenValueProps.length > 0 && (
                  <p className="text-xs text-muted mt-2">
                    İlk ekrandaki vaatler: {h.firstScreenValueProps.map((v) => `“${v.text}”`).join(" · ")}
                  </p>
                )}
                {h.modules.length > 0 && (
                  <p className="text-xs text-muted-2 mt-2">
                    Sayfa akışı: {h.modules.map((m) => m.label).join(" → ")}
                  </p>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {data.criteria.length > 0 && (
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-ink">Sektör ölçütleri</h3>
            <p className="text-xs text-muted mt-1">
              Sektör kataloğundaki kapalı sorular. Paydaya yalnızca var/yok kesinleşmiş gözlemler girer; bilinmeyenler ayrıca gösterilir.
            </p>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <tbody>
                {data.criteria.map((c) => (
                  <tr key={c.code} className="border-t border-line align-top">
                    <td className="py-2 pr-3 text-xs text-muted whitespace-nowrap">{c.code}</td>
                    <td className="py-2 pr-3 text-ink-2">{c.question}</td>
                    <td className="py-2 pr-3 text-xs">
                      {c.rows.map((r) => (
                        <span key={r.value} className="inline-block mr-3">
                          {r.value}: <span className="text-ink">{r.count}</span>
                          {r.percent !== null && <span className="text-muted"> (%{r.percent})</span>}
                        </span>
                      ))}
                    </td>
                    <td className="py-2 text-xs text-muted whitespace-nowrap">
                      payda {c.denominator}
                      {c.excluded.unknown > 0 && <span className="text-sky"> · {c.excluded.unknown} bilinmiyor</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
