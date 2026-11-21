/** No fixed user-facing document page cap. Browser/PDF engines are bounded by
 * actual memory, file format, page rendering safety and available resources.
 * Keep these exports as the existing shared contract for all conversion modes.
 */
export const MAX_CONVERSION_PAGES=Number.MAX_SAFE_INTEGER;
export const MAX_NATIVE_PRINT_PAGES=Number.MAX_SAFE_INTEGER;
