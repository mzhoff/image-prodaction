'use client';

import { useEffect } from 'react';
import {
  createPipelineFromState,
  getNextPipelineTitle,
  normalizePipelineTitle,
  saveActivePipeline,
  uniquePipelineTitle,
} from './graph-pipelines';
import {
  createBackendPipeline,
  deleteBackendPipeline,
  fetchBackendPipelines,
  saveBackendPipeline,
} from './pipeline-api';
import { createPipelineRecordFromBackend } from './pipeline-config';
import { normalizePortableProjectExport } from './project-portability';
import { initialProject } from './initial-project';
import { createEmptyProjectUiState } from './project-schema';
import { useProductionGraphStore } from './use-production-graph-store';
import type { PipelineRecord } from './project-schema';
import type { ProductionGraphState } from './store-types';
import type { GraphProject } from './types';

const PIPELINE_AUTOSAVE_DEBOUNCE_MS = 5000;

export function usePipelineBackendSync(preferredActivePipelineId?: string) {
  const initialized = useProductionGraphStore((state) => state.pipelineSync.initialized);
  const setPipelineSyncState = useProductionGraphStore((state) => state.setPipelineSyncState);

  useEffect(() => {
    if (initialized) return undefined;

    const controller = new AbortController();
    setPipelineSyncState({ error: null, status: 'loading' });

    fetchBackendPipelines(controller.signal)
      .then((pipelines) => {
        const pipelineRecords = pipelines.map(createPipelineRecordFromBackend);
        useProductionGraphStore.getState().loadPipelines(pipelineRecords, preferredActivePipelineId);
        useProductionGraphStore.getState().setPipelineSyncState({
          error: null,
          initialized: true,
          lastSyncedAt: new Date().toISOString(),
          status: pipelineRecords.length > 0 ? 'synced' : 'idle',
        });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        useProductionGraphStore.getState().setPipelineSyncState({
          error: getErrorMessage(error, 'Pipeline load failed.'),
          initialized: true,
          status: 'error',
        });
      });

    return () => controller.abort();
  }, [initialized, preferredActivePipelineId, setPipelineSyncState]);

  useEffect(() => {
    const dirtyPipelineIds = new Set<string>();
    let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
    let saving = false;

    const scheduleAutosave = () => {
      if (autosaveTimer) clearTimeout(autosaveTimer);
      if (dirtyPipelineIds.size === 0 || saving) return;

      const state = useProductionGraphStore.getState();
      if (state.pipelineSync.status !== 'syncing') {
        state.setPipelineSyncState({ error: null, status: 'pending' });
      }

      autosaveTimer = setTimeout(() => {
        autosaveTimer = null;
        void flushDirtyPipelines();
      }, PIPELINE_AUTOSAVE_DEBOUNCE_MS);
    };

    const flushDirtyPipelines = async () => {
      if (saving) return;

      const dirtyIds = Array.from(dirtyPipelineIds);
      const records = getPipelineRecordsForSave(dirtyIds);
      dirtyIds.forEach((pipelineId) => dirtyPipelineIds.delete(pipelineId));
      if (records.length === 0) return;

      saving = true;
      useProductionGraphStore.getState().setPipelineSyncState({ error: null, status: 'syncing' });

      const results = await Promise.allSettled(records.map(async (pipeline) => ({
        id: pipeline.id,
        pipeline: await saveBackendPipeline(pipeline),
      })));

      const failedIds: string[] = [];
      const errors: string[] = [];
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          useProductionGraphStore.getState().acknowledgePipelineSaved(result.value.pipeline);
          return;
        }

        failedIds.push(records[index].id);
        errors.push(getErrorMessage(result.reason, 'Pipeline save failed.'));
      });

      failedIds.forEach((id) => dirtyPipelineIds.add(id));
      saving = false;

      if (failedIds.length > 0) {
        useProductionGraphStore.getState().setPipelineSyncState({
          error: errors[0],
          status: 'error',
        });
        return;
      }

      useProductionGraphStore.getState().setPipelineSyncState({
        error: null,
        lastSyncedAt: new Date().toISOString(),
        status: dirtyPipelineIds.size > 0 ? 'pending' : 'synced',
      });

      if (dirtyPipelineIds.size > 0) scheduleAutosave();
    };

    const unsubscribe = useProductionGraphStore.subscribe((state, previousState) => {
      if (!state.pipelineSync.initialized) return;

      const configChanged = state.activePipelineId
        && state.activePipelineId === previousState.activePipelineId
        && hasActivePipelineConfigChange(state, previousState);

      if (configChanged) {
        dirtyPipelineIds.add(state.activePipelineId);
      }

      if (configChanged) scheduleAutosave();
    });

    return () => {
      if (autosaveTimer) clearTimeout(autosaveTimer);
      unsubscribe();
      if (dirtyPipelineIds.size > 0) {
        void flushDirtyPipelines();
      }
    };
  }, []);
}

export async function createPipelineOnBackend(title?: string) {
  const state = useProductionGraphStore.getState();
  const savedPipelines = saveActivePipeline(state);
  const pipelineTitle = uniquePipelineTitle(
    normalizePipelineTitle(title, getNextPipelineTitle(savedPipelines)),
    savedPipelines,
  );

  useProductionGraphStore.getState().setPipelineSyncState({ error: null, status: 'syncing' });

  try {
    const row = await createBackendPipeline({
      name: pipelineTitle,
      project: initialProject,
      uiState: createEmptyProjectUiState(),
    });
    const pipeline = createPipelineRecordFromBackend(row, savedPipelines.length);

    useProductionGraphStore.getState().addPipeline(pipeline);
    useProductionGraphStore.getState().setPipelineSyncState({
      error: null,
      lastSyncedAt: new Date().toISOString(),
      status: 'synced',
    });

    return pipeline.id;
  } catch (error) {
    useProductionGraphStore.getState().setPipelineSyncState({
      error: getErrorMessage(error, 'Pipeline create failed.'),
      status: 'error',
    });
    throw error;
  }
}

export async function importPipelineOnBackend(payload: unknown, title?: string) {
  const imported = normalizePortableProjectExport(payload);
  const state = useProductionGraphStore.getState();
  const savedPipelines = saveActivePipeline(state);
  const pipelineTitle = uniquePipelineTitle(
    normalizePipelineTitle(title, imported.kind === 'pipelineTemplate' ? 'Imported template' : 'Imported project'),
    savedPipelines,
  );

  useProductionGraphStore.getState().setPipelineSyncState({ error: null, status: 'syncing' });

  try {
    const row = await createBackendPipeline({
      name: pipelineTitle,
      project: imported.project as GraphProject,
      uiState: imported.uiState,
    });
    const pipeline = createPipelineRecordFromBackend(row, savedPipelines.length);

    useProductionGraphStore.getState().addPipeline(pipeline);
    useProductionGraphStore.getState().setPipelineSyncState({
      error: null,
      lastSyncedAt: new Date().toISOString(),
      status: 'synced',
    });

    return { id: pipeline.id, kind: imported.kind, title: pipeline.title };
  } catch (error) {
    useProductionGraphStore.getState().setPipelineSyncState({
      error: getErrorMessage(error, 'Pipeline import failed.'),
      status: 'error',
    });
    throw error;
  }
}

export async function deletePipelineFromBackend(pipelineId: string) {
  useProductionGraphStore.getState().setPipelineSyncState({ error: null, status: 'syncing' });

  try {
    await deleteBackendPipeline(pipelineId);
    useProductionGraphStore.getState().setPipelineSyncState({
      error: null,
      lastSyncedAt: new Date().toISOString(),
      status: 'synced',
    });
  } catch (error) {
    useProductionGraphStore.getState().setPipelineSyncState({
      error: getErrorMessage(error, 'Pipeline delete failed.'),
      status: 'error',
    });
    throw error;
  }
}

function getPipelineRecordsForSave(pipelineIds: string[]): PipelineRecord[] {
  const state = useProductionGraphStore.getState();
  const now = new Date().toISOString();
  const recordsById = new Map(state.pipelines.map((pipeline) => [pipeline.id, pipeline]));
  const currentPipeline = state.pipelines.find((pipeline) => pipeline.id === state.activePipelineId);

  if (state.activePipelineId) {
    recordsById.set(state.activePipelineId, createPipelineFromState(state, currentPipeline, now));
  }

  return pipelineIds.flatMap((pipelineId) => {
    const pipeline = recordsById.get(pipelineId);
    return pipeline ? [pipeline] : [];
  });
}

function hasActivePipelineConfigChange(state: ProductionGraphState, previousState: ProductionGraphState) {
  return state.version !== previousState.version
    || state.nodes !== previousState.nodes
    || state.sections !== previousState.sections
    || state.edges !== previousState.edges
    || state.assets !== previousState.assets
    || state.presets !== previousState.presets
    || state.subjects !== previousState.subjects
    || state.locations !== previousState.locations
    || state.publications !== previousState.publications
    || state.runs !== previousState.runs
    || state.selectedNodeIds !== previousState.selectedNodeIds
    || state.selectedSectionIds !== previousState.selectedSectionIds
    || state.uiState.nodes !== previousState.uiState.nodes
    || state.uiState.sections !== previousState.uiState.sections;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
