import { and, eq } from 'drizzle-orm';
import type { ChatPrincipal } from '@prodactionpro/chat-server-core';
import { getDb } from '@/shared/db/client';
import { createUuidV7, isUuidV7 } from '@/shared/lib/id';
import { openRouterImageCatalog } from '@/modules/provider-connections/adapters/openrouter-image-catalog';
import { homeImageSettingsRequestSchema, homeSubjectPreviews, HOME_IMAGE_SETTINGS_ENTITY, type PinnedHomeImageSettings } from '../contracts/home-image-settings';
import { homeImageSettings } from './home-chat-schema';
import { requireHomeConversation } from './home-conversation-service';
import { snapshotHomeSubjects } from './home-subject-snapshots';
import { homeGenerationReferenceCount } from '../core/home-generation-settings';

type SettingsRecord = typeof homeImageSettings.$inferSelect;
type SettingsLookup = (id: string, principal: ChatPrincipal, conversationId: string) => Promise<SettingsRecord | undefined>;
interface SettingsDependencies {
  requireConversation(principal: ChatPrincipal, conversationId: string): Promise<unknown>;
  subjects: typeof snapshotHomeSubjects;
  resolveModel: typeof openRouterImageCatalog.resolve;
  save(record: typeof homeImageSettings.$inferInsert): Promise<void>;
  createId(): string;
}
const defaults: SettingsDependencies = {
  requireConversation: requireHomeConversation, subjects: snapshotHomeSubjects,
  resolveModel: (...args) => openRouterImageCatalog.resolve(...args),
  async save(record) { await getDb().insert(homeImageSettings).values(record); },
  createId: createUuidV7,
};

export async function createHomeImageSettings(principal: ChatPrincipal, raw: unknown, dependencies: SettingsDependencies = defaults) {
  const parsed = homeImageSettingsRequestSchema.safeParse(raw);
  if (!parsed.success) throw new Error('Проверьте модель, формат, размер и список героев.');
  const { conversationId, uploadedReferenceCount, ...settings } = parsed.data;
  settings.subjectIds = [...new Set(settings.subjectIds)];
  await dependencies.requireConversation(principal, conversationId);
  const subjects = await dependencies.subjects(principal, settings.subjectIds);
  // This count is a preflight hint only; prepare/execute validate the original message's actual attachments.
  const referenceCount = homeGenerationReferenceCount(uploadedReferenceCount, subjects);
  await dependencies.resolveModel(settings.model, settings, referenceCount);
  const id = dependencies.createId();
  await dependencies.save({ id, conversationId, workspaceId: principal.tenantId!,
    userId: principal.userId, settings, subjects });
  return { settingsId: id, settings, subjects: subjects.map(({ id: subjectId, name, reference }) => ({
    id: subjectId, name, referenceCount: reference ? 1 : 0,
  })), subjectPreviews: homeSubjectPreviews(subjects), referenceCount };
}

export async function readHomeImageSettings(principal: ChatPrincipal, conversationId: string,
  selectors: unknown, lookup: SettingsLookup = lookupSettings): Promise<PinnedHomeImageSettings | undefined> {
  if (!selectors || typeof selectors !== 'object' || !('entity' in selectors)) return undefined;
  const entity = selectors.entity;
  if (!entity || typeof entity !== 'object' || !('type' in entity) || entity.type !== HOME_IMAGE_SETTINGS_ENTITY) return undefined;
  if (!('id' in entity) || typeof entity.id !== 'string' || !isUuidV7(entity.id)) throw new Error('Настройки изображения устарели. Отправьте запрос заново.');
  const snapshot = await lookup(entity.id, principal, conversationId);
  if (!snapshot || snapshot.conversationId !== conversationId || snapshot.workspaceId !== principal.tenantId
    || snapshot.userId !== principal.userId) throw new Error('Настройки изображения недоступны в этом разговоре. Выберите параметры заново.');
  return snapshot;
}

async function lookupSettings(id: string, principal: ChatPrincipal, conversationId: string) {
  const [snapshot] = await getDb().select().from(homeImageSettings).where(and(
    eq(homeImageSettings.id, id), eq(homeImageSettings.conversationId, conversationId),
    eq(homeImageSettings.workspaceId, principal.tenantId!), eq(homeImageSettings.userId, principal.userId),
  )).limit(1);
  return snapshot;
}
