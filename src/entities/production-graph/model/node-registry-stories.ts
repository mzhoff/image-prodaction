import type { ProductionNodeDefinitionMap } from './node-registry-types';

export const storiesNodeDefinitions = {
  reverieStories: {
    type: 'reverieStories', title: 'REVERIE Stories', menuLabel: 'REVERIE Stories',
    collapsible: true, defaultHeight: 560,
    ports: [
      { id: 'title', label: 'Заголовок', kind: 'text', side: 'input' },
      { id: 'subtitle', label: 'Подзаголовок', kind: 'text', side: 'input' },
      { id: 'text', label: 'Текст', kind: 'text', side: 'input' },
      { id: 'image', label: 'Фон', kind: 'image', side: 'input' },
      { id: 'video', label: 'Видео', kind: 'video', side: 'input' },
      { id: 'poster', label: 'Постер видео', kind: 'image', side: 'input' },
      { id: 'poll', label: 'Опрос', kind: 'json', side: 'input' },
      { id: 'document', label: 'Несколько слайдов', kind: 'json', side: 'input' },
      ...Array.from({ length: 11 }, (_, index) => ({ id: `document-${index + 2}`, label: `Слайд ${index + 2}`, kind: 'json' as const, side: 'input' as const })),
      { id: 'story', label: 'Stories', kind: 'json', side: 'output' },
    ],
    createData: () => ({ title: 'REVERIE Stories', storyMode: 'slide', storyTitle: '', subtitle: '', text: '',
      locale: 'ru-RU', styleProfileId: 'reverie-default', styleRevisionId: 'reverie-default-r1' }),
  },
} satisfies ProductionNodeDefinitionMap<'reverieStories'>;
