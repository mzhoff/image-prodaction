'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { onboardingChangeSchema, type OnboardingState } from '@/shared/onboarding/contract';

export function useOnboardingDraft(initial: OnboardingState, preview: boolean) {
  const [draft, setDraft] = useState(initial);
  const [status, setStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(!preview);
  const draftRef = useRef(draft); draftRef.current = draft;
  const revision = useRef(initial.revision);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const saved = useRef(JSON.stringify(initial));
  const previewKey = `reverie:onboarding-preview:v1:${initial.userId}`;
  useEffect(() => {
    if (!preview) return;
    try {
      const raw = sessionStorage.getItem(previewKey);
      if (raw) {
        const value = JSON.parse(raw);
        const parsed = onboardingChangeSchema.safeParse({ revision: value.revision, step: value.step,
          answers: value.answers, locale: value.locale, theme: value.theme });
        if (value.userId === initial.userId && parsed.success) {
          const restored = { ...initial, ...parsed.data };
          setDraft(restored); saved.current = JSON.stringify(restored);
        }
      }
    } catch { /* The preview still works when browser storage is unavailable. */ }
    setReady(true);
  }, [initial, preview, previewKey]);

  const persist = useCallback((snapshot = draftRef.current, complete = false) => {
    setStatus('saving'); setError('');
    const pending = queue.current.catch(() => undefined).then(async () => {
      try {
        let result: OnboardingState;
        if (preview) {
          result = { ...snapshot, completedAt: complete ? new Date().toISOString() : null };
          try { sessionStorage.setItem(previewKey, JSON.stringify(result)); } catch { /* Preview only. */ }
        } else {
          const response = await fetch('/api/account/onboarding', { method: 'PATCH', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'x-account-id': initial.userId },
            body: JSON.stringify({ revision: revision.current, step: snapshot.step, answers: snapshot.answers,
              locale: snapshot.locale, theme: snapshot.theme, returnTo: snapshot.returnTo, complete }) });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error?.message ?? 'Не удалось сохранить. Попробуйте ещё раз.');
          result = body;
          revision.current = result.revision;
        }
        // Preserve edits made while the request was in flight.
        saved.current = JSON.stringify({ ...snapshot, revision: result.revision });
        setDraft((current) => ({ ...current, revision: result.revision }));
        setStatus('saved');
        return result;
      } catch (caught) {
        setStatus('error'); setError(caught instanceof Error ? caught.message : 'Не удалось сохранить'); throw caught;
      }
    });
    queue.current = pending;
    return pending;
  }, [initial.userId, preview, previewKey]);

  useEffect(() => {
    if (!ready || status !== 'saved' || JSON.stringify(draft) === saved.current) return;
    const timer = setTimeout(() => { void persist(draft).catch(() => undefined); }, 600);
    return () => clearTimeout(timer);
  }, [draft, persist, ready, status]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!preview && JSON.stringify(draftRef.current) !== saved.current) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [preview]);
  return { draft, setDraft, persist, status, error, ready };
}
