import type { ProductionNodeDefinitionMap } from './node-registry-types';
import { DEFAULT_PUBLICATION_CONTENT_UNIT_ID } from './publication-platforms';

export const publicationNodeDefinitions = {
  telegramPublication: {
    type: 'telegramPublication',
    title: 'Telegram Post',
    menuLabel: 'Telegram post',
    collapsible: true,
    defaultHeight: 640,
    ports: [
      { id: 'body', label: 'Text blocks', kind: 'text', side: 'input' },
      { id: 'media-0', label: 'Image 1', kind: 'image', side: 'input' },
      { id: 'formatRules', label: 'Format rules', kind: 'text', side: 'input' },
      { id: 'checkRules', label: 'Check rules', kind: 'text', side: 'input' },
    ],
    createData: () => ({
      title: 'Telegram Post',
      artifactId: '',
      contentUnitId: DEFAULT_PUBLICATION_CONTENT_UNIT_ID,
      mediaInputCount: 1,
      mediaOrder: [],
      messageRichText: '',
      messageRichTextSource: '',
      messageSourceText: '',
      messageText: '',
      platformId: 'telegram',
      result: '',
      sourceImageCount: 0,
      sourceTextCount: 0,
    }),
  },
} satisfies ProductionNodeDefinitionMap<'telegramPublication'>;
