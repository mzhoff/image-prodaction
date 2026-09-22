import type { MessageParams } from './translate';

type Translator = (message: string, params?: MessageParams) => string;
const contentKeys = new Set(['id', 'value', 'key', 'name', 'prompt', 'systemPrompt', 'instruction', 'instructions', 'content', 'href', 'src', 'url']);

/** Use only with application-owned option catalogs, never with documents or API data. */
export function localizeUiCatalog<T>(catalog: T, translate: Translator): T {
  function visit(value: unknown, key?: string): unknown {
    if (key && contentKeys.has(key)) return value;
    if (typeof value === 'string') return translate(value);
    if (Array.isArray(value)) return value.map((item) => visit(item));
    if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
      return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, visit(item, name)]));
    }
    return value;
  }
  return visit(catalog) as T;
}
