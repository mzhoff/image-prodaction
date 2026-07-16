import type { ProjectExport } from '@/entities/production-graph/model/project-schema';

const RECOVERY_KEY_PREFIX = 'reverie-document-recovery:v1:';

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
