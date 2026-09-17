const MAX_TITLE_BYTES = 120;
const encoder = new TextEncoder();

/** A node title is not a source filename: keep dots, Cyrillic and other Unicode.
 * Limit UTF-8 bytes so the timestamp, ID and sequence still fit filesystem limits. */
export function sanitizeExportTitle(title: string | undefined) {
  const safe = (title ?? '').normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}<>:"/\\|?*]+/gu, '-')
    .replace(/\s+/gu, ' ')
    .replace(/^[.\s-]+|[.\s-]+$/gu, '');
  let result = '';
  let bytes = 0;
  for (const character of safe) {
    bytes += encoder.encode(character).length;
    if (bytes > MAX_TITLE_BYTES) break;
    result += character;
  }
  return result.replace(/[.\s-]+$/gu, '') || 'Export';
}

/** Create once at click time, before conversion. The whole batch shares an ID;
 * another download gets a fresh ID even within the same millisecond. */
export function createExportDownloadNames(title: string | undefined, now = new Date(), id = crypto.randomUUID()) {
  const stamp = now.toISOString().replace(/:/g, '-').replace('T', '_').replace('.', '-');
  const stem = `${sanitizeExportTitle(title)}__${stamp}__${id.replace(/-/g, '')}`;
  return {
    archive: `${stem}.zip`,
    image: (extension: string, index = 0, total = 1) => {
      if (!['png', 'jpg', 'webp'].includes(extension)) throw new Error('Unsupported export extension');
      const sequence = String(index + 1).padStart(Math.max(3, String(total).length), '0');
      return `${stem}__${sequence}.${extension}`;
    },
  };
}
