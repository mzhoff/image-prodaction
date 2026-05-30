import { createId } from '@/shared/lib/id';
import { createDefaultNode } from './create-default-node';
import { appendGenerationResult } from './generation-history';
import { withHistory } from './graph-history';
import type { ProductionGraphState } from './store-types';
import type { StoreSet } from './store-action-types';
import type { GenerateImageNodeData, ProductionNode, ProductionNodeData } from './types';

export function createGraphNodeActions(set: StoreSet): Pick<
  ProductionGraphState,
  | 'addAsset'
  | 'addNode'
  | 'assignAssetToNode'
  | 'pasteImageAsset'
  | 'setNodeStatus'
  | 'updateNodeData'
  | 'updateNodePrompt'
  | 'updateNodeResult'
  | 'updateTextPrompt'
  | 'upsertRun'
> {
  return {
    addNode: (type, position) => {
      const node = createDefaultNode(type, position);
      set((state) => ({
        ...withHistory(state),
        nodes: [...state.nodes, node],
        selectedNodeIds: [node.id],
      }));
      return node.id;
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
            return { ...node, data: { ...node.data, ...appendGenerationResult(node.data as GenerateImageNodeData, assetId) } };
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
    setNodeStatus: (nodeId, status) => {
      set((state) => ({
        nodes: state.nodes.map((node) => (node.id === nodeId ? { ...node, status } : node)),
      }));
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
    updateTextPrompt: (nodeId, text) => {
      set((state) => ({
        nodes: state.nodes.map((node) => (node.id === nodeId ? { ...node, data: { ...node.data, text } } : node)),
      }));
    },
    upsertRun: (run) => {
      set((state) => ({
        runs: state.runs.some((item) => item.id === run.id)
          ? state.runs.map((item) => (item.id === run.id ? run : item))
          : [run, ...state.runs].slice(0, 30),
      }));
    },
  };
}
