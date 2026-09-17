'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_ASSISTANT_LAUNCHER_PREFERENCE,
  type AssistantLauncherPreference,
} from './assistant-pet-contract';

const STORAGE_KEY = 'image-production.assistant-launcher.v1';
const CHANGE_EVENT = 'image-production:assistant-launcher-change';

function readPreference(): AssistantLauncherPreference {
  if (typeof window === 'undefined') return DEFAULT_ASSISTANT_LAUNCHER_PREFERENCE;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<AssistantLauncherPreference> | null;
    if (parsed?.version === 1 && (parsed.presentation === 'button' || parsed.presentation === 'pet')
      && typeof parsed.characterId === 'string') {
      return { version: 1, characterId: parsed.characterId, presentation: parsed.presentation };
    }
  } catch {
    // A broken optional preference should never block the assistant.
  }
  return DEFAULT_ASSISTANT_LAUNCHER_PREFERENCE;
}

export function useAssistantLauncherPreference() {
  const [preference, setPreference] = useState<AssistantLauncherPreference>(DEFAULT_ASSISTANT_LAUNCHER_PREFERENCE);

  useEffect(() => {
    const sync = () => setPreference(readPreference());
    sync();
    window.addEventListener('storage', sync);
    window.addEventListener(CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(CHANGE_EVENT, sync);
    };
  }, []);

  const updatePreference = useCallback((patch: Partial<AssistantLauncherPreference>) => {
    const next = { ...readPreference(), ...patch, version: 1 as const };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(CHANGE_EVENT));
    setPreference(next);
  }, []);

  return { preference, updatePreference };
}
