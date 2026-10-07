/**
 * Text normalisation for evidence matching.
 *
 * The point is narrow: when the model reports a text it read on the page, we
 * have to find that text in the DOM. Typographic differences must not turn a
 * valid piece of evidence into UNKNOWN.
 */

const WHITESPACE = /[\s  -​ ⁠]+/g;
const SINGLE_QUOTES = /[‘’‚‛′`´]/g;
const DOUBLE_QUOTES = /[“”„‟″]/g;
const DASHES = /[‐-―−]/g;
const COMBINING_DOT = /̇/g;

/**
 * Turkish-safe lowercase.
 *
 * In JavaScript, 'İ'.toLowerCase() produces a combining dotted i (i + U+0307),
 * so "Ürünleri İncele" never matches the key "incele". We also fold dotted and
 * dotless i together, because a page using `text-transform: uppercase` renders
 * "BÖLÜŞTÜRMENIN" while the DOM holds "bölüştürmenin" - the model reads the
 * image, so it quotes the uppercase form.
 *
 * Folding is for SEARCHING only. Stored text is always the DOM form.
 */
export function foldTurkish(s: string): string {
  return s.replace(/[İIı]/g, 'i').toLowerCase().replace(COMBINING_DOT, '');
}

/** Strips only invisible and typographic differences. */
export function normalize(s: string): string {
  return foldTurkish(
    s
      .replace(SINGLE_QUOTES, "'")
      .replace(DOUBLE_QUOTES, '"')
      .replace(DASHES, '-')
      .replace(WHITESPACE, ' '),
  ).trim();
}

/** Also equalises number formatting: "%2,99" matches "% 2.99". Last resort. */
export function normalizeNumeric(s: string): string {
  return normalize(s)
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/%\s+/g, '%')
    .replace(/\s+%/g, '%');
}
