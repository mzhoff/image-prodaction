'use client';

import { ClipboardCopy, Copy, Download, HelpCircle, Lock, Palette, Pencil, Maximize2, PlayCircle,
  RotateCcw, Star, Trash2, Unlock, Upload } from 'lucide-react';
import { useCallback } from 'react';
import type { Dispatch, MouseEvent as ReactMouseEvent, SetStateAction } from 'react';
import type { useFavoriteNodePresets } from '@/entities/production-graph/api/use-favorite-node-presets';
import { getNodeCurrentImageAssetId,
  getNodeImageAssetIds } from '@/entities/production-graph/model/graph-io';
import type { GraphSection, ProductionNode,
  ProductionNodeType } from '@/entities/production-graph/model/types';
import { getNodeAskAiLaunchNotice,
  type NodeAskAiLaunchResult } from '@/features/chat-assistant/model/node-ask-ai';
import { requestNodeTitleRename } from '@/features/graph-node/ui/node-title';
import type { ContextMenuAction } from '@/shared/ui/context-menu-types';
import type { useCanvasNavigation } from '@/shared/ui/use-canvas-navigation';
import type { useContextMenu } from '@/shared/ui/use-context-menu';
import type { useStudioPipelinePublications } from '@/modules/executable-pipelines/adapters/studio/use-studio-pipeline-publications';
import { addNodeMenuGroups,
  createAddNodeContextMenuActions } from '../lib/add-node-menu';
import type { useProductionCanvasStore } from './use-production-canvas-store';
import { hasClearableGenerationData } from './production-canvas-values';

type GraphModel = ReturnType<typeof useProductionCanvasStore>;
type CanvasNavigation = ReturnType<typeof useCanvasNavigation>;
type ContextMenu = ReturnType<typeof useContextMenu>;
type StudioPipelines = ReturnType<typeof useStudioPipelinePublications>;
type FavoriteNodes = ReturnType<typeof useFavoriteNodePresets>;

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
    exportSectionPipelineTemplate, favoriteNodes, graph, importPipelineTemplateAt, openImageViewer,
    onAskAiNode, projectId, sectionColorPreviews, setSectionColorPreviews, showToast,
    studioPipelines } = options;

  const getSectionMenuActions = useCallback((section: GraphSection): ContextMenuAction[] => {
    const publication = studioPipelines.publicationsBySectionId.get(section.id);
    const publishing = studioPipelines.publishingSectionIds.has(section.id);
    return [
      {
        id: 'make-section-executable',
        label: publication ? 'Publish executable version' : 'Make executable',
        icon: <PlayCircle size={14} />, disabled: publishing || !projectId,
        onSelect: () => { void studioPipelines.publishSection(section.id)
          .then((next) => showToast(`Executable pipeline published: v${next.version}.`))
          .catch((error) => showToast(error instanceof Error
            ? error.message : 'Could not publish executable pipeline.')); },
      },
      { id: 'export-section-pipeline', label: 'Export Pipeline', icon: <Download size={14} />,
        separatorBefore: true,
        onSelect: () => exportSectionPipelineTemplate(section.id, section.title) },
      { id: 'rename-section', label: 'Rename group', icon: <Pencil size={14} />,
        onSelect: () => { const title = window.prompt('Group name', section.title);
          if (title) graph.renameSection(section.id, title); } },
      { id: 'duplicate-section', label: 'Duplicate group', icon: <Copy size={14} />,
        onSelect: () => graph.duplicateSection(section.id) },
      { id: 'section-color', kind: 'color', label: 'Background', icon: <Palette size={14} />,
        value: sectionColorPreviews[section.id] ?? section.color ?? '#d9d9d9',
        onPreview: (color) => setSectionColorPreviews((current) => ({
          ...current, [section.id]: color,
        })),
        onCommit: (color) => { setSectionColorPreviews((current) => {
          const { [section.id]: _preview, ...next } = current; return next;
        }); graph.setSectionColor(section.id, color); } },
      { id: 'toggle-section-lock', label: section.locked ? 'Unlock group' : 'Lock group',
        icon: section.locked ? <Unlock size={14} /> : <Lock size={14} />,
        separatorBefore: true, onSelect: () => graph.toggleSectionLock(section.id) },
      { id: 'delete-section', label: 'Delete group', icon: <Trash2 size={14} />,
        destructive: true, separatorBefore: true,
        onSelect: () => graph.deleteSection(section.id) },
    ];
  }, [exportSectionPipelineTemplate, graph, projectId, sectionColorPreviews,
    setSectionColorPreviews, showToast, studioPipelines]);

  const getCanvasMenuActions = useCallback((worldPoint: { x: number; y: number }) => [
    { id: 'import-pipeline', label: 'Import Pipeline', icon: <Upload size={14} />,
      onSelect: () => importPipelineTemplateAt(worldPoint) },
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
  ], [canvas, createNode, graph, importPipelineTemplateAt]);

  const getNodeMenuActions = useCallback((node: ProductionNode): ContextMenuAction[] => {
    const matchingFavorite = favoriteNodes.findMatchingFavorite(node);
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
      { id: 'toggle-node-lock', label: node.locked ? 'Unlock' : 'Lock',
        icon: node.locked ? <Unlock size={14} /> : <Lock size={14} />,
        onSelect: () => graph.toggleNodeLock(node.id) },
    ];
    const visibleBaseActions = node.type === 'banner'
      ? baseActions.filter((action) => action.id !== 'rename-node')
      : baseActions;
    return [...visibleBaseActions, ...imageActions, ...generationActions,
      { id: 'delete-node', label: 'Delete', icon: <Trash2 size={14} />,
        destructive: true, separatorBefore: true, onSelect: graph.deleteSelected }];
  }, [copyAssetToClipboard, downloadAssets, favoriteNodes, graph, onAskAiNode,
    openImageViewer, showToast]);

  const openCanvasMenu = useCallback((event: ReactMouseEvent) => {
    const point = canvas.screenToWorld(event.nativeEvent) ?? { x: 0, y: 0 };
    closeContextMenu(); contextMenu.openContextMenu(event, getCanvasMenuActions(point));
  }, [canvas, closeContextMenu, contextMenu, getCanvasMenuActions]);
  const openNodeMenuAt = useCallback((node: ProductionNode, x: number, y: number) => {
    graph.selectNode(node.id); closeContextMenu();
    contextMenu.openContextMenuAt(x, y, getNodeMenuActions(node), 244);
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
