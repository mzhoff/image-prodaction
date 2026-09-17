import { createHash } from 'node:crypto';
import { createUuidV7 } from '@/shared/lib/id';
import type { DocumentAssistantEventKind } from '../contracts/document-assistant-activity';

export interface DocumentActivityIdentity {
  productId: string;
  workspaceId: string;
  userId: string;
  documentId: string;
  nodeId: string;
  kind: DocumentAssistantEventKind;
  assetId?: string;
}

/** One completed asset in one user's node is one fact, even across tabs/retries. */
export function createDocumentActivityId(input: DocumentActivityIdentity) {
  if (!input.assetId) return createUuidV7();
  const bytes = createHash('sha256').update(JSON.stringify([
    'document-generation:v1', input.productId, input.workspaceId.toLowerCase(), input.userId,
    input.documentId.toLowerCase(), input.nodeId, input.kind, input.assetId.toLowerCase(),
  ])).digest().subarray(0, 16);
  // RFC 9562 UUIDv8: application-defined deterministic SHA-256 identity.
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The repository's atomic insert decides the winner; its original time/payload win. */
export async function insertDocumentActivityOnce<T>(repository: {
  insertIfAbsent: () => Promise<T | undefined>;
  findExisting: () => Promise<T | undefined>;
}): Promise<T> {
  const record = await repository.insertIfAbsent() ?? await repository.findExisting();
  if (!record) throw new Error('Document activity could not be persisted.');
  return record;
}
