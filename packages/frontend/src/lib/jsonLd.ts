/**
 * JSON for a `<script type="application/ld+json">` element. JSON.stringify leaves `<` as it is, so
 * a string holding `</script>` would end the element and let markup through; `<` reads back
 * as the same `<` to a JSON parser.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
