export type GenerationWaitingKind = 'image' | 'video';

export type GenerationWaitingPhase = 'submitting' | 'queued' | 'running' | 'saving';

export interface GenerationWaitingVisual {
  durationMs: number;
  id: string;
  kind: GenerationWaitingKind;
  lottieUrl: string;
  source: {
    /** Editable master file. Keep this URL pointed at the current Jitter source, never at the JSON export. */
    jitterFileUrl?: string;
  };
  title: string;
}

export const GENERATION_WAITING_VISUALS: readonly GenerationWaitingVisual[] = [
  {
    id: 'pixel-snake-v1', kind: 'image', title: 'Pixel snake', durationMs: 4_000,
    lottieUrl: '/animations/generation-waiting/v1/pixel-snake.json', source: {},
  },
  {
    id: 'pixel-orbit-v1', kind: 'image', title: 'Pixel orbit', durationMs: 4_800,
    lottieUrl: '/animations/generation-waiting/v1/pixel-orbit.json', source: {},
  },
  {
    id: 'pixel-puzzle-v1', kind: 'image', title: 'Pixel puzzle', durationMs: 5_200,
    lottieUrl: '/animations/generation-waiting/v1/pixel-puzzle.json', source: {},
  },
  {
    id: 'film-strip-v1', kind: 'video', title: 'Film strip', durationMs: 11_000,
    lottieUrl: '/animations/generation-waiting/v1/film-strip.json', source: {},
  },
  {
    id: 'signal-radar-v1', kind: 'video', title: 'Signal radar', durationMs: 13_000,
    lottieUrl: '/animations/generation-waiting/v1/signal-radar.json', source: {},
  },
  {
    id: 'frame-parade-v1', kind: 'video', title: 'Frame parade', durationMs: 15_000,
    lottieUrl: '/animations/generation-waiting/v1/frame-parade.json', source: {},
  },
] as const;

export function selectGenerationWaitingVisual(kind: GenerationWaitingKind, seed: string | undefined) {
  const available = GENERATION_WAITING_VISUALS.filter((visual) => visual.kind === kind);
  if (available.length === 0) return undefined;
  return available[stableHash(seed || `${kind}-waiting`) % available.length];
}

export function generationWaitingLabel(phase: GenerationWaitingPhase, kind: GenerationWaitingKind) {
  const noun = kind === 'video' ? 'видео' : 'изображение';
  if (phase === 'submitting') return `Отправляем запрос на ${noun}…`;
  if (phase === 'queued') return 'Задача в очереди…';
  if (phase === 'saving') return 'Сохраняем результат…';
  return kind === 'video' ? 'Собираем видео…' : 'Создаём изображение…';
}

function stableHash(value: string) {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}
