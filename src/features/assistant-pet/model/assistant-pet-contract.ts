export type AssistantLauncherPresentation = 'button' | 'pet';

// Temporarily use the compact launcher while the character is redesigned.
// Keep saved preferences intact so the character can return without migration.
export const ASSISTANT_CHARACTER_AVAILABLE = false;

export type AssistantPetEmotion = 'idle' | 'hover' | 'thinking' | 'celebrate' | 'warning';

export type AssistantNoticeStatus = 'info' | 'success' | 'warning' | 'error';

/**
 * A portable visual definition. Jitter exports replace only the Lottie URLs;
 * the product code continues to speak in semantic emotions.
 */
export interface AssistantPetCharacter {
  id: string;
  name: string;
  /** A native vector wrapper can expose independent layers for CSS/Lottie motion. */
  renderKind?: 'image' | 'rover-v1';
  fallbackImageUrl: string;
  animations: Partial<Record<AssistantPetEmotion, { lottieUrl: string }>>;
}

/**
 * The common contract for a short pet line and a closed-chat notification.
 * `nodeId` is intentionally data, rather than a canvas-specific callback, so
 * the same event can be saved with the document and rendered in chat later.
 */
export interface AssistantNotice {
  id?: string;
  title: string;
  subtitle?: string;
  status?: AssistantNoticeStatus;
  nodeId?: string;
}

export interface AssistantLauncherPreference {
  version: 1;
  characterId: string;
  presentation: AssistantLauncherPresentation;
}

export const DEFAULT_ASSISTANT_LAUNCHER_PREFERENCE: AssistantLauncherPreference = {
  version: 1,
  characterId: 'rover',
  presentation: 'pet',
};
