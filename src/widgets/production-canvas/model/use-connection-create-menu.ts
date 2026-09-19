'use client';

import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { useProductionCanvasStore } from './use-production-canvas-store';
import type { useCanvasNodeFactory } from './use-canvas-node-factory';
import type { useContextMenu } from '@/shared/ui/use-context-menu';
import type { ConnectionDropOnEmpty } from './use-connection-draft';
import { getTextPromptVariablePortIndex, getPortById } from '@/entities/production-graph/model/node-definitions';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { getActiveAssetScopeSnapshot } from '@/entities/production-graph/lib/remote-asset';
import { loadVideoModels } from '@/shared/api/video-model-catalog';
import { createConnectMenuActions, getConnectCreateOptions, getConnectCreateSourceOptions } from '../lib/connect-create-menu';
import { preparePipelineConnectCreate } from '../lib/prepare-pipeline-connect-create';
import { getVideoConnectCreateMode, prepareVideoConnectCreate } from '../lib/prepare-video-connect-create';

export function useConnectionCreateMenu({ contextMenu, createNode, graph, showToast, setPendingConnectionMenu }: {
  contextMenu: ReturnType<typeof useContextMenu>;
  createNode: ReturnType<typeof useCanvasNodeFactory>;
  graph: ReturnType<typeof useProductionCanvasStore>;
  showToast: (message: string) => void;
  setPendingConnectionMenu: Dispatch<SetStateAction<ConnectionDropOnEmpty | null>>;
}) {
  return useCallback((drop: ConnectionDropOnEmpty) => {
    const source = drop.sourceNodeId ? graph.nodesById.get(drop.sourceNodeId) : undefined;
    const target = drop.targetNodeId ? graph.nodesById.get(drop.targetNodeId) : undefined;
    const sourcePort = source && drop.sourcePortId ? getPortById(source, drop.sourcePortId) : undefined;
    const targetPort = target && drop.targetPortId ? getPortById(target, drop.targetPortId) : undefined;
    const options = drop.direction === 'from-output'
      ? sourcePort ? getConnectCreateOptions(sourcePort.kind) : []
      : targetPort ? getConnectCreateSourceOptions(targetPort.kind, drop.targetPortId) : [];
    if (options.length === 0) {
      setPendingConnectionMenu(null);
      return;
    }

    setPendingConnectionMenu(drop);
    contextMenu.openContextMenuAt(drop.screenPoint.x, drop.screenPoint.y, createConnectMenuActions(options, async (option) => {
      let videoPreparation: ReturnType<typeof prepareVideoConnectCreate> | undefined;
      if (drop.direction === 'from-output' && option.type === 'generateVideo' && drop.sourceNodeId && drop.sourcePortId) {
        const before = useProductionGraphStore.getState();
        const scope = getActiveAssetScopeSnapshot();
        const mode = getVideoConnectCreateMode(drop.sourceNodeId, drop.sourcePortId, before);
        if (mode) {
          try {
            showToast('Подбираем видеомодель для подключения…');
            videoPreparation = prepareVideoConnectCreate(mode, await loadVideoModels());
            const latest = useProductionGraphStore.getState();
            if (getActiveAssetScopeSnapshot() !== scope || getVideoConnectCreateMode(drop.sourceNodeId, drop.sourcePortId, latest) !== mode) {
              throw new Error('Источник изменился. Протяните подключение ещё раз.');
            }
          } catch (error) {
            showToast(error instanceof Error ? error.message : 'Не удалось подготовить подключение к видео.');
            setPendingConnectionMenu(null);
            return;
          }
        }
      }
      const nodeId = createNode(option.type, drop.worldPoint);
      if (videoPreparation) graph.updateNodeDataSilent(nodeId, videoPreparation.data);
      if (drop.direction === 'from-output' && option.type === 'textPrompt' && option.targetPortId) {
        const variableIndex = getTextPromptVariablePortIndex(option.targetPortId);
        graph.updateNodeDataSilent(nodeId, {
          variables: [{
            id: option.targetPortId,
            alias: `Variable ${variableIndex >= 0 ? variableIndex + 1 : 1}`,
          }],
        });
      }
      const { sourcePortId, targetPortId } = preparePipelineConnectCreate(nodeId,
        videoPreparation ? { ...option, targetPortId: videoPreparation.targetPortId } : option);
      const result = drop.direction === 'from-output'
        ? drop.sourceNodeId && drop.sourcePortId && targetPortId
          ? graph.connect(drop.sourceNodeId, drop.sourcePortId, nodeId, targetPortId)
          : { ok: false as const, reason: 'Could not create a downstream connection.' }
        : drop.targetNodeId && drop.targetPortId && sourcePortId
          ? graph.connect(nodeId, sourcePortId, drop.targetNodeId, drop.targetPortId)
          : { ok: false as const, reason: 'Could not create an upstream connection.' };
      if (!result.ok) showToast(result.reason);
      else if (videoPreparation) showToast('Видео подключено. Добавьте задание и проверьте настройки перед генерацией.');
      setPendingConnectionMenu(null);
    }));
  }, [contextMenu, createNode, graph, setPendingConnectionMenu, showToast]);

}
