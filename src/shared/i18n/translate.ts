import messages01 from './catalogs/interface-01.json' with { type: 'json' };
import messages02 from './catalogs/interface-02.json' with { type: 'json' };
import messages03 from './catalogs/interface-03.json' with { type: 'json' };
import messages04 from './catalogs/interface-04.json' with { type: 'json' };
import messages05 from './catalogs/interface-05.json' with { type: 'json' };
import messages06 from './catalogs/interface-06.json' with { type: 'json' };
import messages07 from './catalogs/interface-07.json' with { type: 'json' };
import messages08 from './catalogs/interface-08.json' with { type: 'json' };
import extra01 from './catalogs/extra-1.json' with { type: 'json' };
import extra02 from './catalogs/extra-2.json' with { type: 'json' };
import extra03 from './catalogs/extra-3.json' with { type: 'json' };
import extra04 from './catalogs/extra-4.json' with { type: 'json' };
import serverErrors from './catalogs/server-errors.json' with { type: 'json' };
import additional from './catalogs/additional.json' with { type: 'json' };
import onboarding from './catalogs/onboarding.json' with { type: 'json' };

export type InterfaceLocale = 'ru' | 'en';
export type MessageParams = Readonly<Record<string, string | number | boolean | null | undefined>>;

/** Source messages are keys. Only interface-owned copy belongs in this catalog. */
export const englishMessages: Readonly<Record<string, string>> = {
  ...messages01, ...messages02, ...messages03, ...messages04,
  ...messages05, ...messages06, ...messages07, ...messages08,
  ...extra01, ...extra02, ...extra03, ...extra04, ...additional, ...serverErrors, ...onboarding,
};

export function translateMessage(locale: InterfaceLocale, source: string, params?: MessageParams): string {
  const message = locale === 'en' ? englishMessages[source] ?? translateKnownTemplate(source) : source;
  return params ? message.replace(/\{(\w+)\}/g, (token, key: string) =>
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key] ?? '') : token) : message;
}

// Validation helpers can return an already interpolated interface message.
// Match only full, catalogued messages and preserve captured values verbatim.
const templateMessages = Object.entries(englishMessages).filter(([source]) => /\{p\d+\}/.test(source)).sort(([a], [b]) => b.replace(/\{p\d+\}/g, '').length - a.replace(/\{p\d+\}/g, '').length).map(([source, target]) => {
  const parts = source.split(/(\{p\d+\})/g);
  const keys = parts.filter((part) => /^\{p\d+\}$/.test(part));
  const pattern = parts.map((part) => /^\{p\d+\}$/.test(part) ? '([\\s\\S]*?)' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('');
  return { regex: new RegExp(`^${pattern}$`), keys, target };
});
function translateKnownTemplate(source: string): string {
  if (!/[А-Яа-яЁё]/.test(source)) return source;
  for (const { regex, keys, target } of templateMessages) {
    const match = regex.exec(source);
    if (match) return target.replace(/\{p\d+\}/g, (key) => match[keys.indexOf(key) + 1] ?? key);
  }
  return source;
}

export const intlLocale = (locale: InterfaceLocale) => locale === 'en' ? 'en-US' : 'ru-RU';
