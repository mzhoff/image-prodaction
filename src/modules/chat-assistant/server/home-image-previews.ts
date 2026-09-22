import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { ChatPrincipal } from '@prodactionpro/chat-server-core';
import { getDb } from '@/shared/db/client';
import { isUuidV7 } from '@/shared/lib/id';
import { homeSubjectPreviews } from '../contracts/home-image-settings';
import { homeImageSettings } from './home-chat-schema';
import { requireHomeConversation } from './home-conversation-service';

const requestSchema = z.object({
  conversationId: z.string().trim().min(1).max(160),
  settingsIds: z.array(z.string().refine(isUuidV7)).min(1).max(50),
});
type Record = typeof homeImageSettings.$inferSelect;
type Dependencies = {
  requireConversation: typeof requireHomeConversation;
  lookup: (principal: ChatPrincipal, conversationId: string, ids: string[]) => Promise<Record[]>;
};
const defaults: Dependencies = {
  requireConversation: requireHomeConversation,
  lookup: (principal, conversationId, ids) => getDb().select().from(homeImageSettings).where(and(
    eq(homeImageSettings.workspaceId, principal.tenantId!), eq(homeImageSettings.userId, principal.userId),
    eq(homeImageSettings.conversationId, conversationId), inArray(homeImageSettings.id, ids),
  )),
};

export async function readHomeImagePreviews(principal: ChatPrincipal, raw: unknown, deps: Dependencies = defaults) {
  const { conversationId, settingsIds } = requestSchema.parse(raw);
  await deps.requireConversation(principal, conversationId);
  const records = await deps.lookup(principal, conversationId, [...new Set(settingsIds)]);
  return Object.fromEntries(records.filter((record) => record.workspaceId === principal.tenantId
    && record.userId === principal.userId && record.conversationId === conversationId && settingsIds.includes(record.id))
    .map((record) => [record.id, homeSubjectPreviews(record.subjects)]));
}
