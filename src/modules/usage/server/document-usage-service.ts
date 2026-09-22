import { getDocument, DocumentNotFoundError } from '@/entities/document/server/document-service';
import type { DocumentUsage } from '../contracts/document-usage';
import { readDocumentUsage } from './document-usage-repository';

const defaults = { document: getDocument, read: readDocumentUsage, now: () => new Date() };
export function createDocumentUsageService(dependencies: {
  document: (userId: string, documentId: string) => Promise<{ workspaceId: string; status: string; createdAt: string }>;
  read: typeof readDocumentUsage;
  now: () => Date;
} = defaults) {
  return async (userId: string, documentId: string): Promise<DocumentUsage> => {
    // Workspace scope is derived from an accessible document, never from a browser selector.
    const document = await dependencies.document(userId, documentId);
    if (document.status !== 'active') throw new DocumentNotFoundError();
    const now = dependencies.now();
    const scope = { documentId, workspaceId: document.workspaceId, updatedAt: now.toISOString() };
    const rows = await dependencies.read(scope);
    const total = rows.find((row) => row.category === null);
    if (!total) throw new Error('Document usage aggregate is missing.');
    return { documentId, workspaceId: scope.workspaceId, createdAt: document.createdAt, updatedAt: scope.updatedAt,
      total: { requests: total.requests, costUsd: total.costUsd, unknownCostRequests: total.unknownCostRequests },
      categories: rows.flatMap((row) => row.category === null ? [] : [{ ...row, category: row.category }]),
    };
  };
}
export const getDocumentUsage = createDocumentUsageService();
