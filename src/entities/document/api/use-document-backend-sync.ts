'use client';
import { useTranslations } from '@/shared/i18n/use-translations';
import { useEffectEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useDocumentMetadata } from './use-document-metadata';
import { activateAssetScope } from '@/entities/production-graph/lib/remote-asset';
import type { ProjectExport } from '@/entities/production-graph/model/project-schema';
import { isDisposableUntouchedDocument } from '@/entities/document/model/document-lifecycle';
import {
  clearPendingUntouchedDocument,
  markPendingUntouchedDocument,
} from './document-abandonment';
import {
  discardEmptyDocumentProject,
  fetchDocumentProject,
  saveDocumentProjectSnapshot,
} from './document-api';
import {
  captureDocumentRecoverySnapshot,
  clearDocumentRecoverySnapshot,
  recoverDocumentAfterLoadFailure,
  loadDocumentRecoverySnapshot,
  saveDocumentRecoverySnapshot,
} from './document-recovery';
import { classifyDocumentSyncFailure, createDebouncedAction, DOCUMENT_AUTOSAVE_DELAY_MS } from './document-sync';
import type { DocumentSyncState, UseDocumentBackendSyncOptions } from './document-sync';
import { retainDocumentExitSave, waitForDocumentExitSave } from './document-exit-tasks';
import { createDocumentOpenTracker } from './document-open-tracker';
export function useDocumentBackendSync({
  exportSnapshot,
  importSnapshot,
  projectId,
  resetProject,
  subscribeToProjectChanges,
}: UseDocumentBackendSyncOptions) {
  const tUi = useTranslations();
  const tEffect = useEffectEvent(tUi);
  const [thumbnailMode, setThumbnailMode] = useState<'auto' | 'manual'>('auto');
  const [thumbnailAvailable, setThumbnailAvailable] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string>();
  const [revision, setRevision] = useState<number>();
  const [loadedDocumentId, setLoadedDocumentId] = useState<string>();
  const [reloadSequence, setReloadSequence] = useState(0);
  const [saveSequence, setSaveSequence] = useState(0);
  const [syncState, setSyncState] = useState<DocumentSyncState>({ phase: projectId ? 'loading' : 'idle' });
  const discardCandidateRef = useRef<string | null>(null);
  const { documentName, favorite, documentStatus, setDocumentName, setFavorite, setDocumentStatus,
    renameDocument, setDocumentFavorite, moveDocumentToTrash } = useDocumentMetadata(projectId, discardCandidateRef);
  const [documentOpen] = useState(createDocumentOpenTracker);
  const exitRef = useRef<(() => Promise<number>) | null>(null);
  const prepareExit = useCallback(() => exitRef.current?.() ?? Promise.reject(new Error('Document is not ready.')), []);

  useEffect(() => {
    if (!projectId) {
      documentOpen.select(undefined);
      discardCandidateRef.current = null;
      setDocumentName(undefined);
      setFavorite(false);
      setDocumentStatus('active');
      setThumbnailMode('auto');
      setThumbnailAvailable(false);
      setWorkspaceId(undefined);
      setRevision(undefined);
      setLoadedDocumentId(undefined);
      setSaveSequence(0);
      setSyncState({ phase: 'idle' });
      return undefined;
    }
    const documentId = projectId;
    discardCandidateRef.current = null;
    if (documentOpen.select(documentId)) {
      setWorkspaceId(undefined);
    }

    const controller = new AbortController();
    let active = true;
    let changedWhileSaving = false;
    let dirty = false;
    let thumbnailDirty = false;
    let halted = false;
    let pageHiding = false;
    let revision = 0;
    let releaseAssetScope = () => {};
    let saving = false;
    let unsubscribe = () => {};
    let loaded = false;
    let flight: Promise<void> | undefined;
    let exitFlight: Promise<number> | undefined;
    let exitSnapshot: ProjectExport | undefined;
    let saveFailure: unknown;

    const persistRecovery = () => {
      if (dirty) captureDocumentRecoverySnapshot(documentId, exportSnapshot);
    };

    const performSave = async () => {
      if ((!active && !exitSnapshot) || halted || saving || !dirty) return;
      let snapshot: ProjectExport;
      try { snapshot = exitSnapshot ?? exportSnapshot(); } catch (error) {
        saveFailure = error;
        if (active) setSyncState(classifyDocumentSyncFailure(error));
        return;
      }
      saving = true;
      changedWhileSaving = false;
      dirty = false;
      const refreshThumbnail = thumbnailDirty;
      thumbnailDirty = false;
      exitSnapshot = undefined;
      saveDocumentRecoverySnapshot(documentId, snapshot);
      if (active) setSyncState({ phase: 'saving' });

      try {
        const saved = await saveDocumentProjectSnapshot(documentId, snapshot, revision);
        revision = saved.revision;
        saveFailure = undefined;
        if (!dirty) clearDocumentRecoverySnapshot(documentId);
        if (!active) return;
        setRevision(saved.revision);
        setThumbnailMode(saved.thumbnailMode);
        setThumbnailAvailable(saved.thumbnailAvailable);
        setSyncState({ phase: 'saved' });
        if (refreshThumbnail) setSaveSequence((current) => current + 1);
      } catch (error) {
        saveFailure = error;
        const failure = classifyDocumentSyncFailure(error);
        halted = failure.phase === 'conflict';
        dirty = true;
        thumbnailDirty ||= refreshThumbnail;
        if (active) setSyncState(failure);
      } finally {
        saving = false;
        if (active && changedWhileSaving && !halted && debouncedSave.pending === false) debouncedSave.schedule();
      }
    };
    const save = () => {
      if (saving) return flight ?? Promise.resolve();
      flight = performSave();
      return flight;
    };
    const debouncedSave = createDebouncedAction(() => { void save(); }, DOCUMENT_AUTOSAVE_DELAY_MS);
    const flushOnExit = () => {
      if (exitFlight) return exitFlight;
      if (!loaded) return Promise.reject(new Error('Document is not ready.'));
      debouncedSave.cancel();
      // Freeze before unmount: the shared graph may soon contain another document.
      if (dirty) {
        exitSnapshot = exportSnapshot();
        saveDocumentRecoverySnapshot(documentId, exitSnapshot);
      }
      exitFlight = retainDocumentExitSave(documentId, (async () => {
        await flight;
        if (dirty && !halted) {
          // If the in-flight request failed without newer edits, its recovery copy
          // is retained; do not read the shared graph after navigating away.
          exitSnapshot ??= loadDocumentRecoverySnapshot(documentId) ?? undefined;
          await save();
        }
        if (saveFailure || halted || dirty) throw saveFailure ?? new Error('Document was not saved.');
        return revision;
      })());
      return exitFlight;
    };
    exitRef.current = flushOnExit;

    const markDirty = (change?: { thumbnailRelevant?: boolean }) => {
      if (halted) return;
      discardCandidateRef.current = null;
      dirty = true;
      if (change?.thumbnailRelevant !== false) thumbnailDirty = true;
      if (saving) changedWhileSaving = true;
      setSyncState((current) => current.phase === 'saving' || current.phase === 'dirty' ? current : { phase: 'dirty' });
      debouncedSave.schedule();
    };

    const handleBeforeUnload = persistRecovery;

    const discardIfUntouched = () => {
      if (discardCandidateRef.current !== documentId) return;
      discardCandidateRef.current = null;
      void discardEmptyDocumentProject(documentId).catch(() => undefined);
    };

    const handlePageHide = () => {
      pageHiding = true;
      if (discardCandidateRef.current === documentId) {
        markPendingUntouchedDocument(documentId);
      }
    };

    const handlePageShow = () => {
      pageHiding = false;
      clearPendingUntouchedDocument(documentId);
    };

    async function load() {
      setSyncState({ phase: 'loading' });
      setLoadedDocumentId(undefined);
      try {
        await waitForDocumentExitSave(documentId);
        if (!active) return;
        const project = await fetchDocumentProject(documentId, controller.signal);
        if (!active) return;
        clearPendingUntouchedDocument(documentId);
        const recoverySnapshot = loadDocumentRecoverySnapshot(documentId);
        discardCandidateRef.current = !recoverySnapshot && isDisposableUntouchedDocument(project)
          ? documentId
          : null;
        if (recoverySnapshot) {
          importSnapshot(recoverySnapshot, 'projectSnapshot');
          dirty = true;
          thumbnailDirty = true;
        } else if (project.snapshot) {
          importSnapshot(project.snapshot, 'projectSnapshot');
        } else {
          resetProject();
        }
        revision = project.revision;
        loaded = true;
        setLoadedDocumentId(documentId);
        setRevision(project.revision);
        releaseAssetScope();
        releaseAssetScope = activateAssetScope({
          documentId,
          workspaceId: project.workspaceId,
        });
        setDocumentName(project.name);
        setFavorite(project.favorite);
        setDocumentStatus(project.status);
        setThumbnailMode(project.thumbnailMode);
        setThumbnailAvailable(project.thumbnailAvailable);
        setWorkspaceId(project.workspaceId);
        if (recoverySnapshot) {
          setSyncState({
            phase: 'recovery',
            message: tEffect("Восстановлены локальные изменения, которые не успели сохраниться перед закрытием страницы."),
          });
        } else {
          clearDocumentRecoverySnapshot(documentId);
          setSyncState({ phase: 'saved' });
        }
        documentOpen.loaded(documentId);
      } catch {
        if (!active || controller.signal.aborted) return;
        const recovered = recoverDocumentAfterLoadFailure(documentId, importSnapshot);
        setSyncState(recovered);
        if (recovered.phase !== 'recovery') return;
        setLoadedDocumentId(documentId);
        // Without the server revision, keep edits locally until this document is reloaded.
        halted = true;
        unsubscribe = subscribeToProjectChanges(() => {
          saveDocumentRecoverySnapshot(documentId, exportSnapshot());
        });
        return;
      }

      if (!active) return;
      unsubscribe = subscribeToProjectChanges(markDirty);
      window.addEventListener('beforeunload', handleBeforeUnload);
      window.addEventListener('pagehide', handlePageHide);
      window.addEventListener('pageshow', handlePageShow);
      if (dirty && !halted) debouncedSave.schedule();
    }

    void load();

    return () => {
      persistRecovery();
      if (loaded && (dirty || saving)) void flushOnExit().catch(() => undefined);
      if (exitRef.current === flushOnExit) exitRef.current = null;
      if (!pageHiding) discardIfUntouched();
      active = false;
      controller.abort();
      debouncedSave.cancel();
      releaseAssetScope();
      unsubscribe();
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [documentOpen, exportSnapshot, importSnapshot, projectId, reloadSequence, resetProject, setDocumentName, setDocumentStatus, setFavorite, subscribeToProjectChanges]);

  return {
    documentName,
    documentReady: !projectId || loadedDocumentId === projectId,
    prepareExit,
    documentStatus,
    favorite,
    renameDocument,
    setDocumentFavorite,
    moveDocumentToTrash,
    reloadFromServer: () => setReloadSequence((current) => current + 1),
    saveSequence,
    revision,
    syncState,
    thumbnailAvailable,
    thumbnailMode,
    workspaceId,
  };
}
