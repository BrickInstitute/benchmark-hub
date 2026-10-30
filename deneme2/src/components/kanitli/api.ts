// OTOMATİK KOPYA — benchmark-collector/web/src/api.ts (scripts/hub-esitle.ts). Burada düzenlemeyin.
import type {
  OrneklerYaniti,
  RaporGovdesi,
  RaporListesiOgesi,
} from '@/lib/kanitli/rapor-sozlesmesi';
import { API_TABAN } from './taban';

async function al<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) {
    const govde = (await r.json().catch(() => ({}))) as { hata?: string };
    throw new Error(govde.hata ?? `${r.status}`);
  }
  return (await r.json()) as T;
}

export const raporlariGetir = () =>
  al<{ raporlar: RaporListesiOgesi[] }>(`${API_TABAN}/raporlar`).then((x) => x.raporlar);

export const raporGetir = (id: string) =>
  al<RaporGovdesi>(`${API_TABAN}/raporlar/${encodeURIComponent(id)}`);

export function ornekleriGetir(p: {
  benchmark_surum_id: string;
  criterion_kod: string;
  haric_kurum_id?: string;
  deger?: string | null;
  limit?: number;
  imlec?: string | null;
}): Promise<OrneklerYaniti> {
  const q = new URLSearchParams({
    benchmark_surum_id: p.benchmark_surum_id,
    criterion_kod: p.criterion_kod,
    farkli_olanlar: 'true',
    limit: String(p.limit ?? 6),
  });
  if (p.haric_kurum_id) q.set('haric_kurum_id', p.haric_kurum_id);
  if (p.deger) q.set('deger', p.deger);
  if (p.imlec) q.set('imlec', p.imlec);
  return al<OrneklerYaniti>(`${API_TABAN}/ornekler?${q}`);
}
