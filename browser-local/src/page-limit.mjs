/** DEV41: shared document page limits; never imply unbounded browser memory.
 * A real 132-page HWP was rejected at the historical 120-page threshold.
 * Keep native print preparation at 120 because it holds all SVG pages in memory.
 * PDF converters process one page at a time and remain subject to 512 MiB output,
 * per-page image/vector budgets, cancellation and PDF integrity checks.
 */
export const MAX_CONVERSION_PAGES=200;
export const MAX_NATIVE_PRINT_PAGES=120;
