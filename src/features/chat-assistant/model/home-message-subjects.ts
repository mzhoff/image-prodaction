import type { ChatMessage, LegacyChatAttachment } from '@prodactionpro/chat-domain';
import { HOME_IMAGE_SETTINGS_ENTITY, homeSubjectPreviewSchema, type HomeSubjectPreview } from '@/modules/chat-assistant/contracts/home-image-settings';
import { isUuidV7 } from '@/shared/lib/id';

export type HomeMessageSubjectPreviews = Record<string, HomeSubjectPreview[]>;

export function messageImageSettingsId(message: ChatMessage): string | undefined {
  if (message.role !== 'user') return;
  const selectors = message.metadata?.contextSelectors;
  if (!selectors || typeof selectors !== 'object' || !('entity' in selectors)) return;
  const entity = selectors.entity;
  if (!entity || typeof entity !== 'object' || !('type' in entity) || entity.type !== HOME_IMAGE_SETTINGS_ENTITY) return;
  return 'id' in entity && isUuidV7(entity.id) ? entity.id : undefined;
}

/** Presentation only. Never pass these extra thumbnails back to runtime.submit or the generator. */
export function presentHomeMessageSubjects(messages: ChatMessage[], previews: HomeMessageSubjectPreviews): ChatMessage[] {
  return messages.map((message) => {
    if (message.role !== 'user') return message;
    const pending = homeSubjectPreviewSchema.array().safeParse(message.metadata?.homeSubjectPreviews);
    const subjects = pending.success ? pending.data : previews[messageImageSettingsId(message) ?? message.id];
    if (!subjects?.length) return message;
    const attachments = Array.isArray(message.metadata?.attachments) ? message.metadata.attachments : [];
    const heroes: LegacyChatAttachment[] = subjects.filter((subject) => subject.assetId).map((subject) => ({
      id: `home-subject:${subject.id}`, kind: 'image', name: `Герой · ${subject.name}`,
      url: `/api/assets/${subject.assetId}/content?variant=thumbnail`,
    }));
    return { ...message, metadata: { ...message.metadata, attachments: [...attachments,
      ...heroes.filter((hero) => !attachments.some((item) => item && typeof item === 'object' && 'id' in item && item.id === hero.id))] } };
  });
}
