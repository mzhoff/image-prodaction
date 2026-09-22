import type { ChatAttachmentApplicationService, ConversationStore } from '@prodactionpro/chat-application';
import { managedAttachmentRefSchema, type ManagedChatAttachmentRef } from '@prodactionpro/chat-domain';
import type { ChatPrincipal } from '@prodactionpro/chat-server-core';
import type { ToolExecutionContext } from '@prodactionpro/chat-connectors';

export async function readHomeGenerationMessage(store: ConversationStore, context: ToolExecutionContext) {
  if (!context.turnId) throw new Error('Сообщение не найдено. Отправьте запрос заново.');
  const turn = await store.findAgentTurn(context.turnId);
  if (!turn || turn.conversationId !== context.conversationId || turn.userId !== context.userId
    || turn.tenantId !== context.tenantId || turn.productId !== context.productId) throw new Error('Сообщение недоступно.');
  const sourceTurnId = turn.originalTurnId ?? turn.id;
  const message = (await store.listMessages(context.conversationId)).find((entry) => (
    entry.role === 'user' && entry.metadata?.turnId === sourceTurnId
  ));
  if (!message || message.metadata?.mode !== 'image-generation') {
    throw new Error('Для генерации выберите режим «Изображение» и отправьте запрос.');
  }
  if (!message.blocks.some((block) => (block.type === 'text' || block.type === 'markdown') && block.content.trim())) {
    throw new Error('Добавьте описание изображения. Одних вложений недостаточно для запуска генерации.');
  }
  const attachments = Array.isArray(message.metadata?.attachments) ? message.metadata.attachments.flatMap((value) => {
    const parsed = managedAttachmentRefSchema.safeParse(value);
    return parsed.success ? [parsed.data] : [];
  }) : [];
  return { sourceTurnId, sourceMessageId: message.id, attachments, selectors: message.metadata?.contextSelectors };
}

export function selectHomeReferences(attachments: ManagedChatAttachmentRef[], indexes?: number[]) {
  const selected = [...new Set(indexes ?? attachments.map((_, index) => index))];
  if (selected.length > 3) throw new Error('Прикрепите не более трёх референсов.');
  return selected.map((index) => {
    const ref = attachments[index];
    if (!ref || !['image/png', 'image/jpeg', 'image/webp'].includes(ref.mimeType ?? '')) {
      throw new Error('Референс недоступен. Прикрепите изображение к этому сообщению.');
    }
    return ref;
  });
}

export async function loadHomeReferenceImages(service: ChatAttachmentApplicationService,
  references: ManagedChatAttachmentRef[], principal: ChatPrincipal) {
  await service.assertReadyReferences(references, principal);
  return Promise.all(references.map(async (reference) => {
    const content = await service.getContent(reference.attachmentId, principal);
    const response = await fetch(content.url, { headers: content.headers, method: content.method,
      signal: AbortSignal.timeout(20_000) });
    if (!response.ok || !response.body) throw new Error('Не удалось прочитать референс. Повторите попытку.');
    const chunks: Uint8Array[] = [];
    let length = 0;
    const reader = response.body.getReader();
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        length += part.value.byteLength;
        if (length > 8 * 1024 * 1024) throw new Error('Референс больше 8 МБ. Прикрепите уменьшенную копию.');
        chunks.push(part.value);
      }
    } finally { await reader.cancel().catch(() => undefined); }
    return { dataUrl: `data:${reference.mimeType};base64,${Buffer.concat(chunks).toString('base64')}`, slots: [] };
  }));
}
