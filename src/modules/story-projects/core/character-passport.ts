import type { CharacterPassport, StoryCharacter } from '../contracts/story-character';

export const CHARACTER_CHOICES = {
  role: { lead: 'Главный герой', companion: 'Друг и помощник', opponent: 'Соперник', supporting: 'Второй план' },
  kind: { person: 'Человек', animal: 'Животное', fantasy: 'Сказочный герой', object: 'Оживший предмет' },
  temperament: { kind: 'Добрый', brave: 'Смелый', curious: 'Любопытный', shy: 'Застенчивый', cunning: 'Хитрый', playful: 'Озорной', serious: 'Серьёзный', calm: 'Спокойный' },
  silhouette: { story: 'По описанию', round: 'Округлый', slender: 'Изящный', strong: 'Крепкий', small: 'Миниатюрный' },
  palette: { story: 'Из истории', warm: 'Тёплая', cool: 'Холодная', natural: 'Природная', vivid: 'Яркая', pastel: 'Пастельная' },
  rendering: { story: 'Стиль истории', '3d': 'Объёмная анимация', illustration: 'Иллюстрация', realistic: 'Кинореализм', 'stop-motion': 'Кукольная анимация' },
} as const;

export function characterPassportText(passport: CharacterPassport) {
  const labels = CHARACTER_CHOICES;
  return [
    `${passport.name}. ${passport.identity}`,
    `Роль: ${labels.role[passport.role]}. Тип: ${labels.kind[passport.kind]}.`,
    passport.temperament.length ? `Характер: ${passport.temperament.map((value) => labels.temperament[value]).join(', ')}.` : '',
    passport.silhouette !== 'story' ? `Силуэт: ${labels.silhouette[passport.silhouette]}.` : '',
    passport.palette !== 'story' ? `Палитра: ${labels.palette[passport.palette]}.` : '',
    passport.rendering !== 'story' ? `Визуальная техника: ${labels.rendering[passport.rendering]}.` : '',
    passport.details,
    ...passport.traits.map((trait) => `${trait.locked ? 'Обязательно сохранять' : 'Допустимо менять'}: ${trait.label}.`),
    passport.notes ? `Контекст героя: ${passport.notes}` : '',
    passport.constraints ? `Ограничения: ${passport.constraints}` : '',
  ].filter(Boolean).join('\n');
}

export function characterGenerationPrompt(passport: CharacterPassport, visualStyle: string) {
  return [
    'Создай один цельный визуальный референс персонажа. Один персонаж в полный рост, читаемый силуэт, нейтральная поза в три четверти, спокойный светлый фон. Без надписей, подписей, коллажа и дополнительных персонажей.',
    characterPassportText(passport),
    visualStyle ? `Визуальный контекст истории: ${visualStyle}` : '',
    'Явно выбранные атрибуты паспорта имеют приоритет над общим стилем истории. Сохрани все неизменные признаки.',
  ].filter(Boolean).join('\n\n');
}

export function isCharacterReady(character: StoryCharacter, visualStyle: string) {
  return Boolean(character.selectedReference && character.selectedReference.approvedRevision === character.revision
    && character.selectedReference.visualStyle === visualStyle);
}

export function updateCharacterPassport(character: StoryCharacter, passport: CharacterPassport): StoryCharacter {
  if (JSON.stringify(character.passport) === JSON.stringify(passport)) return character;
  return { ...character, passport, revision: character.revision + 1,
    previousPassports: [...character.previousPassports.slice(-4), character.passport] };
}

export function characterFromLibrary(profile: { id: string; revision: number; name: string; subjectType: string; identitySummary: string; immutableTraits: string; mutableAttributes: string; negativeConstraints: string; notes: string; imageAssetIds: string[] }, id: string): StoryCharacter {
  const traits = profile.immutableTraits.split(/[\n]+/).map((label) => label.trim()).filter(Boolean);
  const boundedTraits = traits.length > 12 ? [...traits.slice(0, 11), traits.slice(11).join('\n')] : traits;
  return { id, revision: 1, source: { subjectId: profile.id, revision: profile.revision }, references: [...profile.imageAssetIds], previousPassports: [],
    passport: { version: 1, name: profile.name, identity: profile.identitySummary || profile.name, role: 'supporting',
      kind: profile.subjectType === 'person' ? 'person' : profile.subjectType === 'animal' ? 'animal' : profile.subjectType === 'character' ? 'fantasy' : 'object',
      temperament: [], silhouette: 'story', palette: 'story', rendering: 'story',
      details: profile.mutableAttributes, constraints: profile.negativeConstraints, notes: profile.notes,
      traits: boundedTraits.map((label) => ({ label, locked: true })),
    } };
}
