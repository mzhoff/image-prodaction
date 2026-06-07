import { createEmptyProjectUiState } from './project-schema';
import { initialProject } from './initial-project';
import {
  createPipelineStatePatch,
  normalizePipelineTitle,
  normalizePipelineState,
  saveActivePipeline,
} from './graph-pipelines';
import type { ProductionGraphState } from './store-types';
import type { StoreGet, StoreSet } from './store-action-types';

export function createGraphPipelineActions(set: StoreSet, get: StoreGet): Pick<
  ProductionGraphState,
  | 'acknowledgePipelineSaved'
  | 'addPipeline'
  | 'deletePipeline'
  | 'loadPipelines'
  | 'setPipelineSyncState'
  | 'switchPipeline'
> {
  return {
    acknowledgePipelineSaved: (savedPipeline) => {
      set((state) => ({
        pipelines: state.pipelines.map((pipeline) => (
          pipeline.id === savedPipeline.id
            ? {
              ...pipeline,
              title: normalizePipelineTitle(savedPipeline.name, pipeline.title),
              createdAt: savedPipeline.createdAt,
              updatedAt: savedPipeline.updatedAt,
            }
            : pipeline
        )),
      }));
    },
    addPipeline: (pipeline) => {
      const state = get();
      const now = new Date().toISOString();
      const savedPipelines = saveActivePipeline(state, now);
      const nextPipelines = savedPipelines.filter((item) => item.id !== pipeline.id);

      set({
        pipelines: [...nextPipelines, pipeline],
        ...createPipelineStatePatch(pipeline),
      });
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
    loadPipelines: (pipelines, activePipelineId) => {
      const pipelineState = normalizePipelineState(
        pipelines,
        activePipelineId,
      );

      if (!pipelineState.activePipeline) {
        set({
          ...initialProject,
          activePipelineId: '',
          historyPast: [],
          historyFuture: [],
          pipelines: [],
          uiState: createEmptyProjectUiState(),
        });
        return;
      }

      set({
        pipelines: pipelineState.pipelines,
        ...createPipelineStatePatch(pipelineState.activePipeline),
      });
    },
    setPipelineSyncState: (syncState) => {
      set((state) => ({
        pipelineSync: {
          ...state.pipelineSync,
          ...syncState,
        },
      }));
    },
  };
}
