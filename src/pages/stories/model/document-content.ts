/** JSON documents can return from storage with their object keys in a different order. */
export function sameDocumentContent(a: unknown, b: unknown): boolean {
  const serialize = (value: unknown) => JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right)))
      : item);
  return serialize(a) === serialize(b);
}
