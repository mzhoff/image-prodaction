import type { StorySettings, StorySnapshot } from '../contracts/story-project';

export const STORY_FORMATS: { value: StorySettings['format']; label: string; duration: number; ratio: StorySettings['aspectRatio']; guidance: string }[] = [
  { value: 'free', label: 'Свободная история', duration: 60, ratio: '16:9', guidance: 'Начните с замысла. Длительность и структуру можно изменить.' },
  { value: 'short-film', label: 'Короткометражный фильм', duration: 180, ratio: '16:9', guidance: 'Завязка → развитие конфликта → кульминация → развязка.' },
  { value: 'advert', label: 'Рекламный фильм', duration: 30, ratio: '16:9', guidance: 'Проблема → продукт в действии → результат → призыв.' },
  { value: 'promo', label: 'Проморолик', duration: 30, ratio: '16:9', guidance: 'Один яркий тезис, несколько доказательств и понятный следующий шаг.' },
  { value: 'youtube', label: 'YouTube-видео', duration: 480, ratio: '16:9', guidance: 'Зацепка → обещание → смысловые главы → вывод.' },
  { value: 'shorts', label: 'Shorts', duration: 30, ratio: '9:16', guidance: 'Одна мысль, быстрый вход и ясный финал. 30 секунд — рекомендация, не лимит площадки.' },
  { value: 'expert', label: 'Экспертное видео', duration: 180, ratio: '16:9', guidance: 'Вопрос → объяснение → пример → практический вывод.' },
];
export const STORY_GENRES: { value: StorySettings['genre']; label: string }[] = [
  { value: 'free', label: 'Без заданного жанра' }, { value: 'comedy', label: 'Комедия' },
  { value: 'tragedy', label: 'Трагедия' }, { value: 'horror', label: 'Ужасы' },
  { value: 'thriller', label: 'Триллер' }, { value: 'documentary', label: 'Документальный' },
];
export function settingsForFormat(format: StorySettings['format']): StorySettings {
  const preset = STORY_FORMATS.find((item) => item.value === format)!;
  return { format, genre: 'free', presetVersion: 1, aspectRatio: preset.ratio, targetDurationSeconds: preset.duration, language: 'Русский' };
}
export function createStorySnapshot(settings: StorySettings): StorySnapshot {
  return { schemaVersion: 2, settings: { ...settings }, blueprint: { purpose: '', audience: '', script: '', visualStyle: '' }, scenes: [] };
}
