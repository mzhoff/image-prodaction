/** The document's creation time stays stable across openings. Use the viewer's local date. */
export function formatDocumentStart(value: string, language = 'ru-RU', now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const today = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  return new Intl.DateTimeFormat(language, {
    hour: '2-digit', minute: '2-digit',
    ...(!today ? { day: 'numeric', month: 'long', ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) } as const : {}),
  }).format(date);
}
