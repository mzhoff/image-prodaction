import { and, eq } from 'drizzle-orm';
import { ChatAccessError, type ChatPrincipal } from '@prodactionpro/chat-server-core';
import { createUuidV7, isUuidV7 } from '@/shared/lib/id';
import { getDb } from '@/shared/db/client';
import { createCatalogFromOpenRouter, createFallbackCatalog, type OpenRouterRawModel } from '@/shared/api/openrouter-models';
import { fetchOpenRouterModels } from '@/shared/api/openrouter';
import { HOME_TEXT_SETTINGS_ENTITY, homeTextSettingsRequestSchema, type HomeTextSettings } from '../contracts/home-text-settings';
import { homeTextSettings } from './home-chat-schema';
import { requireHomeConversation } from './home-conversation-service';
import { readChatAssistantConfig } from './config';

export async function createHomeTextSettings(principal: ChatPrincipal, raw: unknown) {
  const { conversationId, ...settings } = homeTextSettingsRequestSchema.parse(raw);
  await requireHomeConversation(principal, conversationId);
  const catalog = await fetchOpenRouterModels().then((response) => createCatalogFromOpenRouter((response.data ?? []) as OpenRouterRawModel[])).catch(() => createFallbackCatalog());
  if (!catalog.analysisModels.length) catalog.analysisModels = createFallbackCatalog().analysisModels;
  const model = catalog.analysisModels.find((item) => item.id === settings.model);
  if (!model && settings.model !== readChatAssistantConfig().model) throw new Error('Выберите доступную текстовую модель.');
  const parameters = model?.supportedParameters ?? [];
  const normalized: HomeTextSettings = { ...settings,
    temperature: parameters.includes('temperature') ? settings.temperature : undefined,
    reasoning: parameters.includes('reasoning') ? settings.reasoning : undefined };
  const id = createUuidV7();
  await getDb().insert(homeTextSettings).values({ id, conversationId, workspaceId: principal.tenantId!, userId: principal.userId, settings: normalized });
  return { settingsId: id, settings: normalized };
}

export async function readHomeTextSettings(principal: ChatPrincipal, conversationId: string, selectors: unknown,
  lookup = lookupSettings): Promise<HomeTextSettings | undefined> {
  if (!selectors || typeof selectors !== 'object' || !('entity' in selectors)) return;
  const entity = selectors.entity;
  if (!entity || typeof entity !== 'object' || !('type' in entity) || entity.type !== HOME_TEXT_SETTINGS_ENTITY) return;
  if (!('id' in entity) || typeof entity.id !== 'string' || !isUuidV7(entity.id)) throw new ChatAccessError('Выберите параметры текста заново.', 'forbidden');
  const row = await lookup(entity.id, principal, conversationId);
  if (!row || row.conversationId !== conversationId || row.workspaceId !== principal.tenantId || row.userId !== principal.userId) throw new ChatAccessError('Настройки недоступны в этом разговоре.', 'forbidden');
  return row.settings;
}
async function lookupSettings(id: string, principal: ChatPrincipal, conversationId: string) {
  const [row] = await getDb().select().from(homeTextSettings).where(and(eq(homeTextSettings.id, id),
    eq(homeTextSettings.conversationId, conversationId), eq(homeTextSettings.workspaceId, principal.tenantId!), eq(homeTextSettings.userId, principal.userId))).limit(1);
  return row;
}
