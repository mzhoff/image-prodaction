'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createId } from '@/shared/lib/id';
import { canConnectPorts } from './node-definitions';
import { validateGenerateImageReferenceLimit } from './connection-rules';
import { createDefaultNode } from './create-default-node';
import { cloneSnapshot, getSnapshot, pushFutureSnapshot, pushPastSnapshot, withHistory } from './graph-history';
import { initialProject } from './initial-project';
import { normalizeProject } from './normalize-project';
import type { GraphProject, ProductionNode, ProductionNodeData } from './types';
import type { ProductionGraphState } from './store-types';

export { MAX_GENERATE_IMAGE_REFERENCES } from './connection-rules';

export const useProductionGraphStore = create<ProductionGraphState>()(
  persist(
    (set, get) => ({
      ...initialProject,
      historyPast: [],
      historyFuture: [],
      addNode: (type, position) => {
        const node = createDefaultNode(type, position);
        set((state) => ({
          ...withHistory(state),
          nodes: [...state.nodes, node],
          selectedNodeIds: [node.id],
        }));
      },
      addAsset: (asset) => {
        set((state) => ({
          assets: state.assets.some((item) => item.id === asset.id) ? state.assets : [...state.assets, asset],
        }));
      },
      assignAssetToNode: (nodeId, assetId) => {
        set((state) => ({
          ...withHistory(state),
          nodes: state.nodes.map((node) => {
            if (node.id !== nodeId) return node;
            if (node.type === 'importImage' || node.type === 'preview') {
              return { ...node, data: { ...node.data, assetId } };
            }
            if (node.type === 'generateImage') {
              return { ...node, data: { ...node.data, resultAssetId: assetId } };
            }
            return node;
          }),
        }));
      },
      pasteImageAsset: (asset, position, targetNodeId) => {
        set((state) => {
          const targetNode = targetNodeId ? state.nodes.find((node) => node.id === targetNodeId) : undefined;
          const nextAssets = state.assets.some((item) => item.id === asset.id) ? state.assets : [...state.assets, asset];

          if (targetNode?.type === 'importImage') {
            return {
              ...withHistory(state),
              assets: nextAssets,
              nodes: state.nodes.map((node) => (
                node.id === targetNode.id ? { ...node, data: { ...node.data, assetId: asset.id } } : node
              )),
              selectedNodeIds: [targetNode.id],
            };
          }

          const node = createDefaultNode('importImage', position);
          const importNode = { ...node, data: { ...node.data, assetId: asset.id } } satisfies ProductionNode;
          return {
            ...withHistory(state),
            assets: nextAssets,
            nodes: [...state.nodes, importNode],
            selectedNodeIds: [importNode.id],
          };
        });
      },
      connect: (sourceNodeId, sourcePortId, targetNodeId, targetPortId) => {
        const { nodes, edges } = get();
        const source = nodes.find((node) => node.id === sourceNodeId);
        const target = nodes.find((node) => node.id === targetNodeId);
        if (!source || !target || !canConnectPorts(source, sourcePortId, target, targetPortId)) {
          return { ok: false, reason: 'Эти порты нельзя соединить: тип данных не совпадает.' };
        }

        const duplicate = edges.some((edge) => (
          edge.sourceNodeId === sourceNodeId
          && edge.sourcePortId === sourcePortId
          && edge.targetNodeId === targetNodeId
          && edge.targetPortId === targetPortId
        ));
        if (duplicate) return { ok: true };

        const limitError = validateGenerateImageReferenceLimit({
          edges,
          nodes,
          sourceNodeId,
          sourcePortId,
          target,
          targetNodeId,
          targetPortId,
        });
        if (limitError) return limitError;

        set((state) => ({
          ...withHistory(state),
          edges: [...state.edges, { id: createId('edge'), sourceNodeId, sourcePortId, targetNodeId, targetPortId }],
        }));
        return { ok: true };
      },
      deleteSelected: () => {
        const selected = new Set(get().selectedNodeIds);
        if (selected.size === 0) return;

        set((state) => ({
          ...withHistory(state),
          nodes: state.nodes.filter((node) => !selected.has(node.id)),
          edges: state.edges.filter((edge) => !selected.has(edge.sourceNodeId) && !selected.has(edge.targetNodeId)),
          selectedNodeIds: [],
        }));
      },
      deleteEdge: (edgeId) => {
        set((state) => {
          if (!state.edges.some((edge) => edge.id === edgeId)) return state;
          return { ...withHistory(state), edges: state.edges.filter((edge) => edge.id !== edgeId) };
        });
      },
      moveNode: (nodeId, position) => {
        set((state) => ({
          nodes: state.nodes.map((node) => (node.id === nodeId ? { ...node, position } : node)),
        }));
      },
      moveSelectedNodesBy: (delta) => {
        const selected = new Set(get().selectedNodeIds);
        set((state) => ({
          nodes: state.nodes.map((node) => (
            selected.has(node.id)
              ? { ...node, position: { x: node.position.x + delta.x, y: node.position.y + delta.y } }
              : node
          )),
        }));
      },
      pasteNodes: (nodesToPaste, edgesToPaste, position) => {
        if (nodesToPaste.length === 0) return;

        const minX = Math.min(...nodesToPaste.map((node) => node.position.x));
        const minY = Math.min(...nodesToPaste.map((node) => node.position.y));
        const idMap = new Map(nodesToPaste.map((node) => [node.id, createId('node')]));
        const nextNodes = nodesToPaste.map((node) => ({
          ...cloneSnapshot({ nodes: [node], edges: [], assets: [], presets: [], runs: [], selectedNodeIds: [] }).nodes[0],
          id: idMap.get(node.id) ?? createId('node'),
          position: { x: position.x + node.position.x - minX, y: position.y + node.position.y - minY },
        }));
        const nextEdges = edgesToPaste
          .filter((edge) => idMap.has(edge.sourceNodeId) && idMap.has(edge.targetNodeId))
          .map((edge) => ({
            ...edge,
            id: createId('edge'),
            sourceNodeId: idMap.get(edge.sourceNodeId) ?? edge.sourceNodeId,
            targetNodeId: idMap.get(edge.targetNodeId) ?? edge.targetNodeId,
          }));

        set((state) => ({
          ...withHistory(state),
          nodes: [...state.nodes, ...nextNodes],
          edges: [...state.edges, ...nextEdges],
          selectedNodeIds: nextNodes.map((node) => node.id),
        }));
      },
      resetProject: () => set((state) => ({ ...withHistory(state), ...normalizeProject(initialProject) })),
      selectNode: (nodeId, additive = false) => {
        set((state) => {
          if (!additive) return { selectedNodeIds: [nodeId] };
          const selected = new Set(state.selectedNodeIds);
          if (selected.has(nodeId)) selected.delete(nodeId);
          else selected.add(nodeId);
          return { selectedNodeIds: Array.from(selected) };
        });
      },
      selectNodesInRect: (rect) => {
        set((state) => ({
          selectedNodeIds: state.nodes
            .filter((node) => (
              node.position.x <= rect.x + rect.width
              && node.position.x + node.size.width >= rect.x
              && node.position.y <= rect.y + rect.height
              && node.position.y + node.size.height >= rect.y
            ))
            .map((node) => node.id),
        }));
      },
      setNodeStatus: (nodeId, status) => {
        set((state) => ({
          nodes: state.nodes.map((node) => (node.id === nodeId ? { ...node, status } : node)),
        }));
      },
      pushHistory: () => {
        set((state) => withHistory(state));
      },
      undo: () => {
        const state = get();
        const previous = state.historyPast.at(-1);
        if (!previous) return;

        set({
          ...cloneSnapshot(previous),
          historyPast: state.historyPast.slice(0, -1),
          historyFuture: pushFutureSnapshot(state),
        });
      },
      redo: () => {
        const state = get();
        const next = state.historyFuture[0];
        if (!next) return;

        set({
          ...cloneSnapshot(next),
          historyPast: pushPastSnapshot(state),
          historyFuture: state.historyFuture.slice(1),
        });
      },
      updateNodeData: (nodeId, data) => {
        set((state) => ({
          ...withHistory(state),
          nodes: state.nodes.map((node) => (
            node.id === nodeId ? { ...node, data: { ...node.data, ...data } as ProductionNodeData } : node
          )),
        }));
      },
      updateNodePrompt: (nodeId, prompt) => {
        set((state) => ({
          nodes: state.nodes.map((node) => (node.id === nodeId ? { ...node, data: { ...node.data, prompt } } : node)),
        }));
      },
      updateNodeResult: (nodeId, result) => {
        set((state) => ({
          nodes: state.nodes.map((node) => (node.id === nodeId ? { ...node, data: { ...node.data, result } } : node)),
        }));
      },
      upsertRun: (run) => {
        set((state) => ({
          runs: state.runs.some((item) => item.id === run.id)
            ? state.runs.map((item) => (item.id === run.id ? run : item))
            : [run, ...state.runs].slice(0, 30),
        }));
      },
    }),
    {
      name: 'reverie-image-production-project:v1',
      partialize: (state) => ({
        version: state.version,
        nodes: state.nodes,
        edges: state.edges,
        assets: state.assets,
        presets: state.presets,
        runs: state.runs,
        selectedNodeIds: state.selectedNodeIds,
      }),
      merge: (persisted, current) => ({
        ...current,
        ...normalizeProject({ ...initialProject, ...(persisted as Partial<GraphProject>) }),
        historyPast: [],
        historyFuture: [],
      }),
    },
  ),
);
