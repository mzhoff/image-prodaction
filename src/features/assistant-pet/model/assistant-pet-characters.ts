import type { AssistantPetCharacter } from './assistant-pet-contract';

/**
 * First production character. Keep visual sources in the manifest so a Jitter
 * export can be attached emotion-by-emotion without changing the launcher.
 */
export const ASSISTANT_PET_CHARACTERS: readonly AssistantPetCharacter[] = [{
  id: 'rover',
  name: 'Ровер',
  renderKind: 'rover-v1',
  fallbackImageUrl: '/characters/assistant-pet/v1/rover.svg',
  animations: {},
}] as const;

export function findAssistantPetCharacter(characterId: string) {
  return ASSISTANT_PET_CHARACTERS.find((character) => character.id === characterId)
    ?? ASSISTANT_PET_CHARACTERS[0];
}
