export const DOCUMENT_USAGE_CATEGORIES = ['text', 'image', 'video', 'audio', 'assistant', 'other'] as const;
export type DocumentUsageCategory = typeof DOCUMENT_USAGE_CATEGORIES[number];
export interface DocumentUsageAmount {
  requests: number;
  costUsd: string | null;
  unknownCostRequests: number;
}
export interface DocumentUsage {
  documentId: string;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
  total: DocumentUsageAmount;
  categories: (DocumentUsageAmount & { category: DocumentUsageCategory })[];
}
