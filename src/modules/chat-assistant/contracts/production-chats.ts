import { z } from 'zod';

export const chatChangeSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('rename'), title: z.string().trim().min(1).max(120) }).strict(),
  z.object({ action: z.literal('move'), folderId: z.string().uuid().nullable() }).strict(),
  z.object({ action: z.enum(['archive', 'delete', 'restore']) }).strict(),
]);
export type ProductionChatChange = z.infer<typeof chatChangeSchema>;
export interface ProductionChatSummary {
  id: string; title: string; status: 'active' | 'archived' | 'deleted'; folderId: string | null;
  kind: 'home' | 'flow' | 'storyboard' | 'assistant'; href: string; updatedAt: string; messageCount: number;
  artifactName?: string;
  workflowKind?: 'text' | 'image' | 'video' | 'flow' | 'storyboard' | 'timeline';
}
