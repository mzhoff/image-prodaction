'use client';

import { useEffect, useState } from 'react';
import { activateAssetScope } from '@/entities/production-graph/lib/remote-asset';
import type { ProjectExport } from '@/entities/production-graph/model/project-schema';
import { fetchDocumentProject, saveDocumentProjectSnapshot } from './document-api';
import {
  clearDocumentRecoverySnapshot,
  loadDocumentRecoverySnapshot,
  saveDocumentRecoverySnapshot,
} from './document-recovery';
import { classifyDocumentSyncFailure, createDebouncedAction } from './document-sync';
import type { DocumentSyncState } from './document-sync';

const AUTOSAVE_DELAY_MS = 800;

interface UseDocumentBackendSyncOptions {
  exportSnapshot: () => ProjectExport;
  importSnapshot: (snapshot: unknown, expectedKind: 'projectSnapshot') => unknown;
  projectId?: string;
  resetProject: () => void;
  subscribeToProjectChanges: (listener: () => void) => () => void;
}

export function useDocumentBackendSync({
  exportSnapshot,
  importSnapshot,
  projectId,
  resetProject,
  subscribeToProjectChanges,
}: UseDocumentBackendSyncOptions) {
  const [documentName, setDocumentName] = useState<string>();
  const [syncState, setSyncState] = useState<DocumentSyncState>({ phase: projectId ? 'loading' : 'idle' });

  useEffect(() => {
    if (!projectId) {
      setDocumentName(undefined);
      setSyncState({ phase: 'idle' });
      return undefined;
    }
    const documentId = projectId;

    const controller = new AbortController();
    let active = true;
    let changedWhileSaving = false;
    let dirty = false;
    let halted = false;
    let revision = 0;
    let releaseAssetScope = () => {};
    let saving = false;
    let unsubscribe = () => {};

    const persistRecovery = () => {
      if (!dirty) return;
      try {
        saveDocumentRecoverySnapshot(documentId, exportSnapshot());
      } catch {
        // Export validation can fail for a partial editor mutation; the graph persistence remains available.
      }
    };

    const save = async () => {
      if (!active || halted || saving || !dirty) return;
      saving = true;
      changedWhileSaving = false;
      dirty = false;
      const snapshot = exportSnapshot();
      saveDocumentRecoverySnapshot(documentId, snapshot);
      setSyncState({ phase: 'saving' });

      try {
        const saved = await saveDocumentProjectSnapshot(documentId, snapshot, revision);
        if (!active) return;
        revision = saved.revision;
        clearDocumentRecoverySnapshot(documentId);
        setSyncState({ phase: 'saved' });
      } catch (error) {
        if (!active) return;
        const failure = classifyDocumentSyncFailure(error);
        halted = failure.phase === 'conflict';
        dirty = true;
        setSyncState(failure);
      } finally {
        saving = false;
        if (active && changedWhileSaving && !halted && debouncedSave.pending === false) debouncedSave.schedule();
      }
    };
    const debouncedSave = createDebouncedAction(() => { void save(); }, AUTOSAVE_DELAY_MS);

    const markDirty = () => {
      if (halted) return;
      dirty = true;
      if (saving) changedWhileSaving = true;
      setSyncState((current) => current.phase === 'saving' ? current : { phase: 'dirty' });
      debouncedSave.schedule();
    };

    const handleBeforeUnload = () => {
      persistRecovery();
    };

    async function load() {
      setSyncState({ phase: 'loading' });
      try {
        const project = await fetchDocumentProject(documentId, controller.signal);
        if (!active) return;
        if (project.snapshot) importSnapshot(project.snapshot, 'projectSnapshot');
        else resetProject();
        revision = project.revision;
        releaseAssetScope();
        releaseAssetScope = activateAssetScope({
          documentId,
          workspaceId: project.workspaceId,
        });
        setDocumentName(project.name);
        clearDocumentRecoverySnapshot(documentId);
        setSyncState({ phase: 'saved' });
      } catch (error) {
        if (!active || controller.signal.aborted) return;
        const recoverySnapshot = loadDocumentRecoverySnapshot(documentId);
        if (recoverySnapshot) {
          try {
            importSnapshot(recoverySnapshot, 'projectSnapshot');
          } catch {
            // Keep the graph store's already rehydrated fallback if this recovery snapshot is invalid.
          }
        }
        setSyncState({
          phase: 'recovery',
          message: 'Сервер недоступен. Открыта локальная аварийная копия; автосохранение повторится после следующего изменения.',
        });
      }

      if (!active) return;
      unsubscribe = subscribeToProjectChanges(markDirty);
      window.addEventListener('beforeunload', handleBeforeUnload);
    }

    void load();

    return () => {
      persistRecovery();
      active = false;
      controller.abort();
      debouncedSave.cancel();
      releaseAssetScope();
      unsubscribe();
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [exportSnapshot, importSnapshot, projectId, resetProject, subscribeToProjectChanges]);

  return { documentName, syncState };
}
