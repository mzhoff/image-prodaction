import { createUuidV7 } from '@/shared/lib/id';
import { createEmptyProjectUiState } from './project-schema';
import { normalizePortableProjectExport } from './project-portability';
import { initialProject } from './initial-project';
import {
  createPipelineRecord,
  createPipelineStatePatch,
  getNextPipelineTitle,
  normalizePipelineTitle,
  saveActivePipeline,
  uniquePipelineTitle,
} from './graph-pipelines';
import type { ProductionGraphState } from './store-types';
import type { StoreGet, StoreSet } from './store-action-types';
import type { GraphProject } from './types';

export function createGraphPipelineActions(set: StoreSet, get: StoreGet): Pick<
  ProductionGraphState,
  'createPipeline' | 'deletePipeline' | 'importPipeline' | 'switchPipeline'
> {
  return {
    createPipeline: (title) => {
      const state = get();
      const now = new Date().toISOString();
      const id = createUuidV7();
      const savedPipelines = saveActivePipeline(state, now);
      const pipelineTitle = uniquePipelineTitle(
        normalizePipelineTitle(title, getNextPipelineTitle(savedPipelines)),
        savedPipelines,
      );
      const pipeline = createPipelineRecord({
        id,
        title: pipelineTitle,
        project: initialProject,
        uiState: createEmptyProjectUiState(),
        createdAt: now,
        updatedAt: now,
      });

      set({
        pipelines: [...savedPipelines, pipeline],
        ...createPipelineStatePatch(pipeline),
      });

      return id;
    },
    switchPipeline: (pipelineId) => {
      const state = get();
      if (pipelineId === state.activePipelineId) return;

      const savedPipelines = saveActivePipeline(state);
      const nextPipeline = savedPipelines.find((pipeline) => pipeline.id === pipelineId);
      if (!nextPipeline) return;

      set({
        pipelines: savedPipelines,
        ...createPipelineStatePatch(nextPipeline),
      });
    },
    deletePipeline: (pipelineId) => {
      const state = get();
      const savedPipelines = saveActivePipeline(state);
      const deleteIndex = savedPipelines.findIndex((pipeline) => pipeline.id === pipelineId);
      if (deleteIndex < 0) {
        return { ok: false, reason: 'Pipeline уже не найден.' };
      }

      const remainingPipelines = savedPipelines.filter((pipeline) => pipeline.id !== pipelineId);
      if (pipelineId !== state.activePipelineId) {
        set({ pipelines: remainingPipelines });
        return { ok: true, activePipelineId: state.activePipelineId };
      }

      const nextActivePipeline = pipelineId === state.activePipelineId
        ? remainingPipelines[Math.max(0, deleteIndex - 1)] ?? remainingPipelines[0]
        : remainingPipelines[0];

      if (!nextActivePipeline) {
        set({
          ...initialProject,
          activePipelineId: '',
          historyPast: [],
          historyFuture: [],
          pipelines: [],
          uiState: createEmptyProjectUiState(),
        });

        return { ok: true, activePipelineId: '' };
      }

      set({
        pipelines: remainingPipelines,
        ...createPipelineStatePatch(nextActivePipeline),
      });

      return { ok: true, activePipelineId: nextActivePipeline.id };
    },
    importPipeline: (payload, title) => {
      const imported = normalizePortableProjectExport(payload);
      const state = get();
      const now = new Date().toISOString();
      const savedPipelines = saveActivePipeline(state, now);
      const pipelineTitle = uniquePipelineTitle(
        normalizePipelineTitle(title, imported.kind === 'pipelineTemplate' ? 'Imported template' : 'Imported project'),
        savedPipelines,
      );
      const pipeline = createPipelineRecord({
        id: createUuidV7(),
        title: pipelineTitle,
        project: imported.project as GraphProject,
        uiState: imported.uiState,
        createdAt: now,
        updatedAt: now,
      });

      set({
        pipelines: [...savedPipelines, pipeline],
        ...createPipelineStatePatch(pipeline),
      });

      return { id: pipeline.id, kind: imported.kind, title: pipeline.title };
    },
  };
}
