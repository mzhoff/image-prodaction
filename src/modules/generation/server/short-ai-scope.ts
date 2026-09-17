import { z } from 'zod';
import { isUuid } from '@/shared/lib/id';

export const shortAiScopeSchema = z.object({
  documentId: z.string().refine(isUuid, 'documentId must be UUID').optional(),
  idempotencyKey: z.string().trim().min(1).max(255).optional(),
  workspaceId: z.string().refine(isUuid, 'workspaceId must be UUID'),
});
