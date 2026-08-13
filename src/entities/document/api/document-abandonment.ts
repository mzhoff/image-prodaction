const PENDING_DISCARD_STORAGE_KEY = 'reverie-untouched-documents:v1';
const MAX_PENDING_DOCUMENTS = 20;
const MAX_PENDING_AGE_MS = 7 * 24 * 60 * 60 * 1_000;

interface PendingDocument {
  id: string;
  markedAt: number;
}

type DocumentAbandonmentStorage = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>;

export function markPendingUntouchedDocument(
  documentId: string,
  storage: DocumentAbandonmentStorage | undefined = getStorage(),
  now = Date.now(),
) {
  if (!storage) return;
  const documents = readPendingDocuments(storage, now)
    .filter((document) => document.id !== documentId);
  documents.unshift({ id: documentId, markedAt: now });
  writePendingDocuments(storage, documents.slice(0, MAX_PENDING_DOCUMENTS));
}

export function clearPendingUntouchedDocument(
  documentId: string,
  storage: DocumentAbandonmentStorage | undefined = getStorage(),
) {
  if (!storage) return;
  const documents = readPendingDocuments(storage).filter((document) => document.id !== documentId);
  writePendingDocuments(storage, documents);
}

export function listPendingUntouchedDocuments(
  storage: DocumentAbandonmentStorage | undefined = getStorage(),
  now = Date.now(),
) {
  if (!storage) return [];
  return readPendingDocuments(storage, now).map((document) => document.id);
}

function readPendingDocuments(storage: Pick<Storage, 'getItem'>, now = Date.now()): PendingDocument[] {
  try {
    const parsed = JSON.parse(storage.getItem(PENDING_DISCARD_STORAGE_KEY) ?? 'null') as unknown;
    if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.documents)) return [];
    return parsed.documents
      .filter(isPendingDocument)
      .filter((document) => now - document.markedAt <= MAX_PENDING_AGE_MS)
      .slice(0, MAX_PENDING_DOCUMENTS);
  } catch {
    return [];
  }
}

function writePendingDocuments(storage: Pick<Storage, 'removeItem' | 'setItem'>, documents: PendingDocument[]) {
  try {
    if (documents.length === 0) {
      storage.removeItem(PENDING_DISCARD_STORAGE_KEY);
      return;
    }
    storage.setItem(PENDING_DISCARD_STORAGE_KEY, JSON.stringify({ version: 1, documents }));
  } catch {
    // Abandonment cleanup is best-effort; the server still validates every explicit discard.
  }
}

function isPendingDocument(value: unknown): value is PendingDocument {
  return isRecord(value)
    && typeof value.id === 'string'
    && value.id.length > 0
    && typeof value.markedAt === 'number'
    && Number.isFinite(value.markedAt);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
