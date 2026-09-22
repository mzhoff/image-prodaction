import type { DocumentSyncState } from './document-sync';
import type { ProjectExport } from '@/entities/production-graph/model/project-schema';

const RECOVERY_KEY_PREFIX = 'reverie-document-recovery:v1:';

export function captureDocumentRecoverySnapshot(projectId: string, exportSnapshot: () => ProjectExport) {
  try {
    saveDocumentRecoverySnapshot(projectId, exportSnapshot());
  } catch {
    // Export validation can fail for a partial editor mutation; graph persistence remains available.
  }
}

export function loadDocumentRecoverySnapshot(projectId: string): ProjectExport | undefined {
  try {
    const raw = window.localStorage.getItem(getRecoveryKey(projectId));
    if (!raw) return undefined;
    return JSON.parse(raw) as ProjectExport;
  } catch {
    return undefined;
  }
}

export function saveDocumentRecoverySnapshot(projectId: string, snapshot: ProjectExport) {
  try {
    window.localStorage.setItem(getRecoveryKey(projectId), JSON.stringify(snapshot));
  } catch {
    // The graph store has its own bounded local fallback if this emergency copy cannot be written.
  }
}

export function clearDocumentRecoverySnapshot(projectId: string) {
  try {
    window.localStorage.removeItem(getRecoveryKey(projectId));
  } catch {
    // Clearing a recovery copy is best-effort after the backend confirms the save.
  }
}

function getRecoveryKey(projectId: string) {
  return `${RECOVERY_KEY_PREFIX}${projectId}`;
}

export function recoverDocumentAfterLoadFailure(
  documentId: string,
  importSnapshot: (snapshot: unknown, expectedKind: 'projectSnapshot') => unknown,
): DocumentSyncState {
  const recoverySnapshot = loadDocumentRecoverySnapshot(documentId);
  if (recoverySnapshot) {
    try {
      importSnapshot(recoverySnapshot, 'projectSnapshot');
      return {
        phase: 'recovery',
        message: 'Сервер недоступен. Открыта копия этого Flow с устройства. Подключитесь снова, чтобы продолжить сохранение.',
      };
    } catch {
      // An unrelated global graph is never a recovery copy of this document.
    }
  }
  return {
    phase: 'error',
    message: 'Не удалось открыть Flow. Проверьте подключение и попробуйте ещё раз.',
  };
}
