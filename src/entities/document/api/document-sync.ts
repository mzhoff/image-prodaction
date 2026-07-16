export type DocumentSyncPhase = 'idle' | 'loading' | 'saved' | 'dirty' | 'saving' | 'recovery' | 'conflict' | 'error';

export interface DocumentSyncState {
  message?: string;
  phase: DocumentSyncPhase;
}

interface TimerAdapter<Handle> {
  clear: (handle: Handle) => void;
  set: (callback: () => void, delayMs: number) => Handle;
}

export function createDebouncedAction<Handle = ReturnType<typeof setTimeout>>(
  action: () => void,
  delayMs: number,
  timer: TimerAdapter<Handle> = {
    clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    set: (callback, delay) => setTimeout(callback, delay) as Handle,
  },
) {
  let handle: Handle | undefined;

  return {
    cancel() {
      if (handle === undefined) return;
      timer.clear(handle);
      handle = undefined;
    },
    flush() {
      if (handle === undefined) return;
      timer.clear(handle);
      handle = undefined;
      action();
    },
    get pending() {
      return handle !== undefined;
    },
    schedule() {
      if (handle !== undefined) timer.clear(handle);
      handle = timer.set(() => {
        handle = undefined;
        action();
      }, delayMs);
    },
  };
}

export function classifyDocumentSyncFailure(error: unknown): DocumentSyncState {
  if (isRecord(error) && error.status === 409 && error.code === 'revision_conflict') {
    const currentRevision = isRecord(error.details) && typeof error.details.currentRevision === 'number'
      ? error.details.currentRevision
      : undefined;
    return {
      phase: 'conflict',
      message: currentRevision === undefined
        ? 'Документ изменён в другой сессии. Перезагрузите страницу, чтобы не затереть новую версию.'
        : `Документ уже обновлён до версии ${currentRevision}. Перезагрузите страницу, чтобы не затереть изменения.`,
    };
  }

  return {
    phase: 'error',
    message: 'Не удалось сохранить документ на сервере. Изменения оставлены в локальной аварийной копии.',
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
