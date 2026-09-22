import { z } from 'zod';
import { isUuidV7 } from '@/shared/lib/id';

export const workspaceCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  creationId: z.string().refine(isUuidV7),
}).strict();

export type WorkspaceCreateInput = z.infer<typeof workspaceCreateSchema>;
