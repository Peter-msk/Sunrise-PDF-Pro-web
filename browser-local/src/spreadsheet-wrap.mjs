/**
 * R66-DEV19: bounded, Unicode-grapheme-aware spreadsheet line wrapping.
 *
 * Uses exact pdf-lib font measurement at candidate line boundaries. Unlike
 * per-character prefix remeasurement it does not exhibit quadratic font
 * measurements for a long line that fits. It does not alter Excel cell data
 * or draw glyphs itself. The caller owns page width and font selection.
 */
const COMPLEX_GRAPHEME = /[\u1100-\u11ff\u200c\u200d]|\p{Mark}|\p{Regional_Indicator}|\p{Emoji_Modifier}/u;
let segmenter;

function graphemes(text) {
  // Most Korean syllables, Latin and digits are standalone code points. Skip
  // the relatively expensive Intl.Segmenter path for those ordinary cells.
  if (!COMPLEX_GRAPHEME.test(text)) return Array.from(text);
  if (typeof Intl?.Segmenter !== 'function') {
    // Don't break a Unicode grapheme into individual code points on browsers
    // which lack the native Unicode segmenter.
    throw Error('SHEET_GRAPHEME_SEGMENTER_REQUIRED');
  }
  segmenter ||= new Intl.Segmenter('und', {granularity: 'grapheme'});
  return Array.from(segmenter.segment(text), part => part.segment);
}

function takeFitting(parts, start, width, font, size) {
  const remaining = parts.length - start;
  const measure = count => font.widthOfTextAtSize(parts.slice(start, start + count).join(''), size);
  let low = 0, high = 1;
  // Exponential search avoids one font measurement per character of a long
  // line. Unlike summed character widths, every probe measures actual runs
  // and therefore retains font kerning/ligatures at the measured boundary.
  while (high <= remaining) {
    if (measure(high) > width) break;
    low = high;
    high *= 2;
  }
  if (low === remaining) return low;
  high = Math.min(high, remaining);
  if (high > low && measure(high) <= width) return high;
  while (high - low > 1) {
    const mid = low + Math.floor((high - low) / 2);
    if (measure(mid) <= width) low = mid;
    else high = mid;
  }
  if (low === 0) throw Error('열 너비가 글자보다 좁습니다. 엑셀에서 열 수를 줄여 주세요.');
  return low;
}

export function wrapSpreadsheetCell(text, width, font, size = 9) {
  if (!(Number.isFinite(width) && width > 0)) throw Error('열 너비가 너무 좁습니다.');
  if (!(Number.isFinite(size) && size > 0) || typeof font?.widthOfTextAtSize !== 'function')
    throw Error('SHEET_FONT_MEASURE_UNAVAILABLE');
  const result = [];
  for (const paragraph of String(text).split(/\r\n|\r|\n/)) {
    const parts = graphemes(paragraph);
    if (!parts.length) { result.push(''); continue; }
    let position = 0;
    while (position < parts.length) {
      const count = takeFitting(parts, position, width, font, size);
      result.push(parts.slice(position, position + count).join(''));
      position += count;
    }
  }
  return result;
}
