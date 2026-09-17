/** Provider requests stay small; the whole source is bounded independently. */
export const MAX_SPEECH_TEXT_CHARACTERS = 30_000;
export const MAX_SPEECH_REQUEST_CHARACTERS = 5_000;
export const SPEECH_CHUNK_TARGET_CHARACTERS = 2_500;
export const MAX_SPEECH_CHUNKS = 24;
export const SPEECH_CHUNKING_VERSION = 1;
export const MAX_SPEECH_EXECUTION_MILLISECONDS = 45 * 60 * 1_000;

export interface SpeechTextChunk { index: number; text: string; startOffset: number; endOffset: number }

/** Lossless: joining text reproduces the trimmed source exactly, including whitespace. */
export function splitSpeechText(value: string): SpeechTextChunk[] {
  const text = value.trim();
  if (!text || text.length > MAX_SPEECH_TEXT_CHARACTERS) {
    throw new Error(`Voice requires 1–${MAX_SPEECH_TEXT_CHARACTERS} characters.`);
  }
  if (text.length <= MAX_SPEECH_REQUEST_CHARACTERS) return [{ index: 0, text, startOffset: 0, endOffset: text.length }];
  const chunks: SpeechTextChunk[] = [];
  let startOffset = 0;
  while (startOffset < text.length) {
    const remaining = text.length - startOffset;
    // Keep a tiny ending with its sentence rather than creating a <10-character provider request.
    let length = remaining <= SPEECH_CHUNK_TARGET_CHARACTERS + 10 ? remaining : findBoundary(text.slice(startOffset, startOffset + SPEECH_CHUNK_TARGET_CHARACTERS));
    // Never split a surrogate pair even for a long string without word boundaries.
    if (length < remaining && /[\uD800-\uDBFF]/u.test(text[startOffset + length - 1]!)) length -= 1;
    const endOffset = startOffset + length;
    chunks.push({ index: chunks.length, text: text.slice(startOffset, endOffset), startOffset, endOffset });
    startOffset = endOffset;
  }
  if (chunks.length > MAX_SPEECH_CHUNKS) throw new Error('This text requires too many speech parts.');
  return chunks;
}

function findBoundary(candidate: string) {
  const minimum = Math.floor(SPEECH_CHUNK_TARGET_CHARACTERS / 2);
  for (const pattern of [/\n[\t ]*\n+/g, /[.!?…]["'»”)]*\s+/g, /\s+/g]) {
    const boundaries = [...candidate.matchAll(pattern)].map((match) => match.index + match[0].length);
    const boundary = boundaries.filter((offset) => offset >= minimum).at(-1);
    if (boundary) return boundary;
  }
  return candidate.length;
}
