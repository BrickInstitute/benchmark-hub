/**
 * Canonical, fixed per-pattern vocabulary - the ladder every criterion of a
 * given pattern uses, in this exact order, across every catalogue in the
 * project (hand-authored or generated). Never supplied by a model; a model
 * only ever READS this to ground a judgment about direction, it never writes
 * it (see catalogue-generation.ts's header for why).
 */
import type { MeasurementPattern } from "@prisma/client";

export const PATTERN_STEPS: Partial<Record<MeasurementPattern, string[]>> = {
  P1: ["var", "yok"],
  P3: ["rakam", "aralik", "kosullu", "yonlendirme", "yok"],
  P4: ["gomulu", "ayri_sayfa", "statik", "yok"],
  P7: ["musteri_yorumu", "sayisal_iddia", "sertifika_akreditasyon", "basin_odul", "kurumsal_referans"],
  P2: ["ilk_ekran", "ilk_kaydirma", "sayfa_alti", "yok"],
  P5: ["0", "1", "2", "3_arti", "ulasilamadi"],
};
