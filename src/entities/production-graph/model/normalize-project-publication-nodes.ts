import { normalizeNodeSize } from './node-layout';
import { normalizeStringArray } from './normalize-project-values';
import { DEFAULT_PUBLICATION_CONTENT_UNIT_ID } from './publication-platforms';
import type { ProductionNode, ProductionNodeData } from './types';

export function normalizePublicationNode(node: ProductionNode): ProductionNode | null {
  if (node.type !== 'telegramPublication') return null;

  const data = node.data as ProductionNodeData & {
    contentUnitId?: unknown;
    mediaInputCount?: unknown;
    mediaOrder?: unknown;
    messageRichText?: unknown;
    messageRichTextSource?: unknown;
    messageSourceText?: unknown;
    messageText?: unknown;
    platformId?: unknown;
    sourceImageCount?: unknown;
    sourceTextCount?: unknown;
  };
  const legacyMessageText = getLegacyTelegramMessageText(data as unknown as Record<string, unknown>);
  return {
    ...node,
    size: normalizeNodeSize(node.type, node.size),
    data: {
      artifactId: '',
      result: '',
      ...data,
      contentUnitId: data.contentUnitId === DEFAULT_PUBLICATION_CONTENT_UNIT_ID
        ? data.contentUnitId
        : DEFAULT_PUBLICATION_CONTENT_UNIT_ID,
      mediaInputCount: typeof data.mediaInputCount === 'number' && Number.isFinite(data.mediaInputCount)
        ? Math.max(1, Math.min(10, Math.floor(data.mediaInputCount)))
        : 1,
      mediaOrder: normalizeStringArray(data.mediaOrder),
      messageRichText: typeof data.messageRichText === 'string' ? data.messageRichText : '',
      messageRichTextSource: typeof data.messageRichTextSource === 'string' ? data.messageRichTextSource : '',
      messageSourceText: typeof data.messageSourceText === 'string' ? data.messageSourceText : '',
      messageText: typeof data.messageText === 'string' ? data.messageText : legacyMessageText,
      platformId: data.platformId === 'telegram' ? data.platformId : 'telegram',
      sourceImageCount: typeof data.sourceImageCount === 'number' && Number.isFinite(data.sourceImageCount)
        ? Math.max(0, Math.floor(data.sourceImageCount))
        : 0,
      sourceTextCount: typeof data.sourceTextCount === 'number' && Number.isFinite(data.sourceTextCount)
        ? Math.max(0, Math.floor(data.sourceTextCount))
        : 0,
      title: 'Telegram Post',
    },
  } as ProductionNode;
}

function getLegacyTelegramMessageText(data: Record<string, unknown>) {
  return ['publicationTitle', 'body', 'caption', 'cta']
    .map((key) => (typeof data[key] === 'string' ? data[key].trim() : ''))
    .filter(Boolean)
    .join('\n\n');
}
