import type { CharacterPassport, StoryCharacter } from '../contracts/story-character';
export const testPassport: CharacterPassport = { version: 1, name: 'Лиса', identity: 'Лесная героиня, которая учится дружить.',
  role: 'companion', kind: 'animal', temperament: ['playful'], silhouette: 'slender', palette: 'warm', rendering: '3d',
  details: 'Большие уши и пушистый хвост.', traits: [{ label: 'Белый кончик хвоста', locked: true }], constraints: 'Без оружия.' };
export const testCharacter: StoryCharacter = { id: '0199c27a-54f4-7fa7-8b98-b7aa3f6f2e9e', revision: 1, passport: testPassport, references: [], previousPassports: [] };
