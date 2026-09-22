export type TemplateTab = 'tutorials' | 'templates';

export interface LearningCard {
  id: string;
  kind: TemplateTab;
  title: string;
  description: string;
  image: string;
  /** Video is optional until the actual lesson is published. */
  videoUrl?: string;
}

/** Editorial scaffold, not an executable template catalog. */
export const learningCards: LearningCard[] = [
  { id: 'first-flow', kind: 'tutorials', title: 'Ваш первый Flow', description: 'От идеи до результата: знакомство с нодовым редактором.', image: '/home/create-flow-glass.webp' },
  { id: 'image-references', kind: 'tutorials', title: 'Работа с референсами', description: 'Как задать стиль, героя и композицию будущего изображения.', image: '/home/create-image-glass.webp' },
  { id: 'reuse-flow', kind: 'tutorials', title: 'Один Flow — много идей', description: 'Меняйте исходники и используйте готовую цепочку снова.', image: '/home/create-storyboard-glass.webp' },
  { id: 'publish-flow', kind: 'tutorials', title: 'Подготовка к запуску', description: 'Входы, результаты и публикация исполняемого Flow.', image: '/home/create-timeline-glass.webp' },
  { id: 'image-template', kind: 'templates', title: 'Изображение по идее', description: 'Простая цепочка: описание, модель и готовое изображение.', image: '/home/create-image-glass.webp' },
  { id: 'reference-template', kind: 'templates', title: 'Сохранить стиль', description: 'Визуальный референс как отправная точка для новых кадров.', image: '/home/create-flow-glass.webp' },
  { id: 'character-template', kind: 'templates', title: 'Герой в новой сцене', description: 'Персонаж, окружение и описание действия в одном Flow.', image: '/home/create-storyboard-glass.webp' },
  { id: 'video-template', kind: 'templates', title: 'Оживить изображение', description: 'Исходный кадр, движение камеры и генерация видео.', image: '/home/create-timeline-glass.webp' },
];
