'use client';

import { ClipboardCopy, Copy, Download, HelpCircle, Layers3, LayoutTemplate, Lock, Pencil,
  Maximize2, RotateCcw, Star, Trash2, Unlock, Upload } from '@prodactionpro/ui-core/icons';
import { useSectionMenuActions } from './use-section-menu-actions';
import { useCallback } from 'react';
import type { Dispatch, MouseEvent as ReactMouseEvent, SetStateAction } from 'react';
import type { useFavoriteNodePresets } from '@/entities/production-graph/api/use-favorite-node-presets';
import type { useNodeTemplatePresets } from '@/entities/production-graph/api/use-node-template-presets';
import { getNodeCurrentImageAssetId,
  getNodeImageAssetIds } from '@/entities/production-graph/model/graph-io';
import { getRenderedNodeSize } from '@/entities/production-graph/model/graph-store-dom';
import { getNodePorts } from '@/entities/production-graph/model/node-definitions';
import type { GraphSection, ProductionNode,
  ProductionNodeType } from '@/entities/production-graph/model/types';
import { NodeIcon } from '@/entities/production-graph/ui/node-icon';
import { getSystemPipelinePresets } from '@/entities/production-graph/model/system-pipeline-presets';
import { getNodeAskAiLaunchNotice,
  type NodeAskAiLaunchResult } from '@/features/chat-assistant/model/node-ask-ai';
import { requestNodeTitleRename } from '@/features/graph-node/ui/node-title';
import type { ContextMenuAction } from '@/shared/ui/context-menu-types';
import type { useCanvasNavigation } from '@/shared/ui/use-canvas-navigation';
import type { useContextMenu } from '@/shared/ui/use-context-menu';
import type { useStudioPipelinePublications } from '@/modules/executable-pipelines/adapters/studio/use-studio-pipeline-publications';
import { addNodeMenu, addNodeMenuGroups,
  createAddNodeContextMenuActions } from '../lib/add-node-menu';
import { getBatchConnectionPlan, type BatchConnectionDirection } from '../lib/batch-connect-create';
import type { useProductionCanvasStore } from './use-production-canvas-store';
import { hasClearableGenerationData } from './production-canvas-values';

type GraphModel = ReturnType<typeof useProductionCanvasStore>;
type CanvasNavigation = ReturnType<typeof useCanvasNavigation>;
type ContextMenu = ReturnType<typeof useContextMenu>;
type StudioPipelines = ReturnType<typeof useStudioPipelinePublications>;
type FavoriteNodes = ReturnType<typeof useFavoriteNodePresets>;
type NodeTemplates = ReturnType<typeof useNodeTemplatePresets>;

interface ProductionCanvasMenusOptions {
  canvas: CanvasNavigation;
  closeContextMenu: () => void;
  contextMenu: ContextMenu;
  copyAssetToClipboard: (assetId: string) => void;
  createNode: (type: ProductionNodeType, position: { x: number; y: number }) => string;
  downloadAssets: (assetIds: string[]) => Promise<void>;
  exportSectionPipelineTemplate: (sectionId: string, title: string) => void;
  favoriteNodes: FavoriteNodes;
  graph: GraphModel;
  importPipelineTemplateAt: (position: { x: number; y: number }) => void;
  nodeTemplates: NodeTemplates;
  onAskAiNode: (node: ProductionNode) => Promise<NodeAskAiLaunchResult>;
  openImageViewer: (nodeId: string, initialIndex: number) => void;
  projectId?: string;
  sectionColorPreviews: Record<string, string>;
  setSectionColorPreviews: Dispatch<SetStateAction<Record<string, string>>>;
  showToast: (message: string) => void;
  studioPipelines: StudioPipelines;
}

export function useProductionCanvasMenus(options: ProductionCanvasMenusOptions) {
  const { canvas, closeContextMenu, contextMenu, copyAssetToClipboard, createNode, downloadAssets,
    favoriteNodes, graph, importPipelineTemplateAt, openImageViewer,
    nodeTemplates, onAskAiNode, showToast } = options;

  const getSectionMenuActions = useSectionMenuActions(options);

  const getCanvasMenuActions = useCallback((worldPoint: { x: number; y: number }) => [
    { id: 'import-pipeline', label: 'Import Pipeline', icon: <Upload size={14} />,
      onSelect: () => importPipelineTemplateAt(worldPoint) },
    { id: 'pipeline-presets', kind: 'submenu' as const, label: 'Pipeline presets',
      icon: <Layers3 size={14} />,
      actions: getSystemPipelinePresets().map((preset) => ({
        id: `pipeline-preset-${preset.key}`,
        label: preset.label,
        onSelect: () => {
          const result = graph.importPipelineTemplateAt(preset.template, worldPoint);
          showToast(`${preset.label}: ${result.nodeCount} nodes added.`);
        },
      })) },
    ...addNodeMenuGroups.map((group) => ({
      id: `add-group-${group.id}`, kind: 'submenu' as const, label: group.label,
      icon: group.icon,
      actions: createAddNodeContextMenuActions(group.items,
        (type) => createNode(type, worldPoint)),
    })),
    { id: 'zoom-to-fit', label: 'Zoom to fit', icon: <Maximize2 size={14} />,
      separatorBefore: true, onSelect: () => canvas.zoomToBounds(graph.bounds) },
    { id: 'reset-project', label: 'Reset local graph', icon: <RotateCcw size={14} />,
      separatorBefore: true, destructive: true, onSelect: graph.resetProject },
  ], [canvas, createNode, graph, importPipelineTemplateAt, showToast]);

  const getNodeMenuActions = useCallback((node: ProductionNode): ContextMenuAction[] => {
    const selectedNodesInGraph = graph.nodes.filter((item) => graph.selectedSet.has(item.id));
    // The menu is built in the same event as selectNode. Use the clicked node
    // immediately when React has not committed the new selection yet.
    const selectedNodes = graph.selectedSet.has(node.id) ? selectedNodesInGraph : [node];
    const hasSelection = selectedNodes.length > 0;
    const extractLimit = 5;
    const selectedImageSources = selectedNodes.filter((item) => getNodePorts(item).some((port) => port.side === 'output' && port.kind === 'image'));
    const sendToExtractReason = selectedImageSources.length > extractLimit
      ? `Extract принимает не больше ${extractLimit} изображений за один анализ. Выделено: ${selectedImageSources.length}.`
      : undefined;
    const createExtractForSelection = () => {
      const position = {
        x: Math.max(...selectedImageSources.map((item) => item.position.x + item.size.width), node.position.x + node.size.width) + 80,
        y: Math.min(...selectedImageSources.map((item) => item.position.y), node.position.y),
      };
      graph.runInHistoryBatch(() => {
        const extractId = createNode('imageToText', position);
        selectedImageSources.slice(0, extractLimit).forEach((source, index) => {
          const output = getNodePorts(source).find((port) => port.side === 'output' && port.kind === 'image');
          if (output) graph.connect(source.id, output.id, extractId, `image-${index}`);
        });
        const sourceColumnWidth = Math.max(...selectedImageSources.map((source) => source.size.width), 260);
        selectedImageSources.slice(0, extractLimit).forEach((source, index) => {
          graph.moveNode(source.id, {
            x: position.x - sourceColumnWidth - 100,
            y: position.y + index * 350,
          });
        });
        graph.moveNode(extractId, {
          x: position.x,
          y: position.y + Math.max(0, (Math.min(selectedImageSources.length, extractLimit) - 1) * 175),
        });
      });
      showToast(`Extract создан и подключён к ${Math.min(selectedImageSources.length, extractLimit)} изображениям.`);
    };
    const addConnectedNodes = (type: ProductionNodeType, direction: BatchConnectionDirection) => {
      const plan = getBatchConnectionPlan(selectedNodes, type, direction, graph.edges, graph.nodes);
      if (!plan) return;
      const pairs: Array<{ source: ProductionNode; target: ProductionNode }> = [];
      graph.runInHistoryBatch(() => {
        plan.forEach(({ selectedNode, newNode, sourcePortId, targetPortId }) => {
          const id = createNode(type, newNode.position);
          // Pipeline field IDs in the plan must also be the live port IDs.
          if (newNode.type === 'pipelineInput' || newNode.type === 'pipelineOutput') {
            graph.updateNodeDataSilent(id, newNode.data);
          }
          const created = { ...newNode, id };
          const source = direction === 'output' ? selectedNode : created;
          const target = direction === 'output' ? created : selectedNode;
          pairs.push({ source, target });
          graph.connect(source.id, sourcePortId, target.id, targetPortId);
        });
        arrangeNodePairs(graph, pairs, direction);
      });
      showToast(`${plan.length} нод добавлено ${direction === 'output' ? 'на выход' : 'на вход'} выделенных.`);
    };
    const getConnectedNodeActions = (direction: BatchConnectionDirection): ContextMenuAction[] => (
      addNodeMenu.filter(({ type }) => getBatchConnectionPlan(selectedNodes, type, direction, graph.edges, graph.nodes))
        .map(({ type, label, icon }) => ({
          id: `add-${direction}-${type}`, label, icon,
          onSelect: () => addConnectedNodes(type, direction),
        }))
    );
    const addToOutputActions = getConnectedNodeActions('output');
    const addToInputActions = getConnectedNodeActions('input');
    const matchingFavorite = favoriteNodes.findMatchingFavorite(node);
    const matchingTemplate = nodeTemplates.findMatchingTemplate(node);
    const assetIds = getNodeImageAssetIds(node);
    const currentAssetId = getNodeCurrentImageAssetId(node);
    const currentIndex = currentAssetId ? Math.max(0, assetIds.indexOf(currentAssetId)) : -1;
    const imageActions: ContextMenuAction[] = currentAssetId ? [
      { id: 'open-node-image', label: 'Expand fullscreen', icon: <Maximize2 size={14} />,
        separatorBefore: true,
        onSelect: () => openImageViewer(node.id, currentIndex >= 0 ? currentIndex : 0) },
      { id: 'copy-current-node-image', label: 'Copy image', icon: <ClipboardCopy size={14} />,
        onSelect: () => copyAssetToClipboard(currentAssetId) },
      { id: 'download-current-node-image', label: 'Download current', icon: <Download size={14} />,
        onSelect: () => void downloadAssets([currentAssetId]) },
      { id: 'download-all-node-images', label: 'Download all', icon: <Download size={14} />,
        disabled: assetIds.length <= 1, onSelect: () => void downloadAssets(assetIds) },
    ] : [];
    const generationActions: ContextMenuAction[] = hasClearableGenerationData(node) ? [
      { id: 'remove-node-generations', label: 'Remove all generations', icon: <Trash2 size={14} />,
        destructive: true, separatorBefore: true,
        onSelect: () => graph.clearNodeGenerations(node.id) },
    ] : [];
    const baseActions: ContextMenuAction[] = [
      { id: 'ask-ai-node', label: 'Ask AI', icon: <HelpCircle size={14} />,
        onSelect: () => { void onAskAiNode(node)
          .then((result) => { const notice = getNodeAskAiLaunchNotice(result);
            if (notice) showToast(notice); })
          .catch(() => showToast('Не удалось открыть Ask AI. Повторите попытку.')); } },
      { id: 'rename-node', label: 'Rename', icon: <Pencil size={14} />,
        onSelect: () => requestNodeTitleRename(node.id) },
      { id: 'copy-node', label: 'Duplicate', icon: <Copy size={14} />,
        onSelect: () => graph.duplicateNode(node.id) },
      {
        id: 'favorite-node-preset',
        label: matchingFavorite ? 'Remove from Favorite' : 'Add to Favorite',
        icon: <Star size={14} fill={matchingFavorite ? 'currentColor' : 'none'} />,
        onSelect: () => {
          const operation = matchingFavorite
            ? favoriteNodes.removeFavorite(matchingFavorite.id).then(() => {
              showToast('Node removed from Favorite.');
            })
            : favoriteNodes.saveFavorite(node).then((result) => {
              showToast(result.strippedAssetReferenceCount > 0
                ? 'Node saved to Favorite without unavailable assets.'
                : 'Node saved to Favorite.');
            });
          void operation.catch((error) => showToast(
            error instanceof Error ? error.message : 'Could not update Favorite.',
          ));
        },
      },
      {
        id: 'node-template-preset',
        label: matchingTemplate ? 'Remove from Templates' : 'Save to Templates',
        icon: <LayoutTemplate size={14} />,
        onSelect: () => {
          const operation = matchingTemplate
            ? nodeTemplates.removeTemplate(matchingTemplate.id).then(() => {
              showToast('Node removed from Templates.');
            })
            : nodeTemplates.saveTemplate(node).then((result) => {
              showToast(result.strippedAssetReferenceCount > 0
                ? 'Node saved to Templates without unavailable assets.'
                : 'Node saved to Templates.');
            });
          void operation.catch((error) => showToast(
            error instanceof Error ? error.message : 'Could not update Templates.',
          ));
        },
      },
      { id: 'toggle-node-lock', label: node.locked ? 'Unlock' : 'Lock',
        icon: node.locked ? <Unlock size={14} /> : <Lock size={14} />,
        onSelect: () => graph.toggleNodeLock(node.id) },
    ];
    const visibleBaseActions = node.type === 'banner'
      ? baseActions.filter((action) => action.id !== 'rename-node')
      : baseActions;
    const batchActions: ContextMenuAction[] = hasSelection ? [
      { id: 'add-node-to-output', kind: 'submenu', label: 'Add to output', icon: <Upload size={14} />, disabled: addToOutputActions.length === 0, disabledReason: 'Для всех выделенных нод нет общей совместимой ноды для выхода.', actions: addToOutputActions },
      { id: 'add-node-to-input', kind: 'submenu', label: 'Add to input', icon: <Download size={14} />, disabled: addToInputActions.length === 0, disabledReason: 'Для всех выделенных нод нет общей совместимой ноды для входа.', actions: addToInputActions },
      { id: 'send-selection-to-extract', label: 'Send to Extract', icon: <NodeIcon nodeType="imageToText" size={14} />, disabled: selectedImageSources.length === 0 || Boolean(sendToExtractReason), disabledReason: sendToExtractReason ?? 'Выдели хотя бы одно изображение.', onSelect: createExtractForSelection },
    ] : [];
    return [...visibleBaseActions, ...batchActions, ...imageActions, ...generationActions,
      { id: 'delete-node', label: 'Delete', icon: <Trash2 size={14} />,
        destructive: true, separatorBefore: true, onSelect: graph.deleteSelected }];
  }, [copyAssetToClipboard, createNode, downloadAssets, favoriteNodes, graph, nodeTemplates,
    onAskAiNode, openImageViewer, showToast]);

  const openCanvasMenu = useCallback((event: ReactMouseEvent) => {
    const point = canvas.screenToWorld(event.nativeEvent) ?? { x: 0, y: 0 };
    closeContextMenu(); contextMenu.openContextMenu(event, getCanvasMenuActions(point));
  }, [canvas, closeContextMenu, contextMenu, getCanvasMenuActions]);
  const openNodeMenuAt = useCallback((node: ProductionNode, x: number, y: number) => {
    if (!graph.selectedSet.has(node.id)) graph.selectNode(node.id);
    closeContextMenu();
    contextMenu.openContextMenuAt(x, y, getNodeMenuActions(node), 280);
  }, [closeContextMenu, contextMenu, getNodeMenuActions, graph]);
  const openNodeMenu = useCallback((node: ProductionNode, event: ReactMouseEvent) => {
    event.preventDefault(); event.stopPropagation();
    openNodeMenuAt(node, event.clientX, event.clientY);
  }, [openNodeMenuAt]);
  const openNodeOptionsMenu = useCallback((node: ProductionNode,
    event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault(); event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    openNodeMenuAt(node, rect.right - 4, rect.bottom + 4);
  }, [openNodeMenuAt]);
  const openSectionMenu = useCallback((section: GraphSection, event: ReactMouseEvent) => {
    closeContextMenu(); graph.selectSection(section.id);
    contextMenu.openContextMenu(event, getSectionMenuActions(section), 260);
  }, [closeContextMenu, contextMenu, getSectionMenuActions, graph]);
  return { openCanvasMenu, openNodeMenu, openNodeOptionsMenu, openSectionMenu };
}


function arrangeNodePairs(graph: GraphModel, pairs: Array<{ source: ProductionNode; target: ProductionNode }>, direction: BatchConnectionDirection) {
  if (pairs.length === 0) return;
  const sizes = pairs.map(({ source, target }) => ({ source: getRenderedNodeSize(source), target: getRenderedNodeSize(target) }));
  const sourceWidth = Math.max(...sizes.map(({ source }) => source.width));
  const baseX = Math.min(...pairs.map(({ source, target }) => direction === 'output'
    ? source.position.x : target.position.x - sourceWidth - 100));
  const baseY = Math.min(...pairs.map(({ source, target }) => direction === 'output' ? source.position.y : target.position.y));
  const rowHeight = Math.max(...sizes.map(({ source, target }) => Math.max(source.height, target.height))) + 48;
  pairs.forEach(({ source, target }, index) => {
    graph.moveNode(source.id, { x: baseX, y: baseY + index * rowHeight });
    graph.moveNode(target.id, { x: baseX + sourceWidth + 100, y: baseY + index * rowHeight });
  });
}
