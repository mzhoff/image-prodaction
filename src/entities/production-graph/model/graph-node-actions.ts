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
  | 'assignBannerAssetToNode'
  | 'clearNodeGenerations'
  | 'duplicateNode'
  | 'pasteImageAsset'
  | 'renameNode'
  | 'resizeNode'
  | 'resizeNodeFrame'
  | 'setNodeStatus'
  | 'toggleNodeLock'
  | 'updateNodeData'
  | 'updateNodeDataSilent'
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
        selectedSectionIds: [],
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
          if (node.type === 'importImage' || node.type === 'preview' || node.type === 'sketch') {
            return { ...node, data: { ...node.data, assetId } };
          }
          if (node.type === 'generateImage') {
            return { ...node, data: { ...node.data, ...appendGenerationResult(node.data as GenerateImageNodeData, assetId) } };
          }
          return node;
        }),
      }));
    },
    assignBannerAssetToNode: (nodeId, asset) => {
      set((state) => {
        const targetNode = state.nodes.find((node) => node.id === nodeId && node.type === 'banner');
        if (!targetNode) return {};
        const nextAssets = state.assets.some((item) => item.id === asset.id) ? state.assets : [...state.assets, asset];
        const aspectRatio = asset.width && asset.height ? asset.width / asset.height : targetNode.size.width / targetNode.size.height;
        const nextWidth = Math.min(Math.max(asset.width ?? targetNode.size.width, 120), 920);
        const nextHeight = Math.min(Math.max(Math.round(nextWidth / Math.max(aspectRatio, 0.1)), 48), 520);
        return {
          ...withHistory(state),
          assets: nextAssets,
          nodes: state.nodes.map((node) => (
            node.id === targetNode.id
              ? {
                ...node,
                size: { width: Math.round(nextWidth), height: nextHeight },
                data: { ...node.data, assetId: asset.id, message: '' } as ProductionNodeData,
              }
              : node
          )),
          selectedNodeIds: [targetNode.id],
          selectedSectionIds: [],
        };
      });
    },
    clearNodeGenerations: (nodeId) => {
      set((state) => {
        const node = state.nodes.find((item) => item.id === nodeId);
        if (!node || !hasClearableGenerationData(node)) return {};
        return {
          ...withHistory(state),
          nodes: state.nodes.map((item) => (
            item.id === nodeId
              ? { ...item, data: { ...item.data, ...getClearedGenerationData(item) } as ProductionNodeData }
              : item
          )),
        };
      });
    },
    duplicateNode: (nodeId) => {
      set((state) => {
        const node = state.nodes.find((item) => item.id === nodeId);
        if (!node) return {};
        const duplicatedNode = {
          ...(JSON.parse(JSON.stringify(node)) as ProductionNode),
          id: createId('node'),
          locked: false,
          position: {
            x: node.position.x + 36,
            y: node.position.y + 36,
          },
        } satisfies ProductionNode;
        return {
          ...withHistory(state),
          nodes: [...state.nodes, duplicatedNode],
          selectedNodeIds: [duplicatedNode.id],
          selectedSectionIds: [],
        };
      });
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
            selectedSectionIds: [],
          };
        }

        const node = createDefaultNode('importImage', position);
        const importNode = { ...node, data: { ...node.data, assetId: asset.id } } satisfies ProductionNode;
        return {
          ...withHistory(state),
          assets: nextAssets,
          nodes: [...state.nodes, importNode],
          selectedNodeIds: [importNode.id],
          selectedSectionIds: [],
        };
      });
    },
    setNodeStatus: (nodeId, status) => {
      set((state) => ({
        nodes: state.nodes.map((node) => (node.id === nodeId ? { ...node, status } : node)),
      }));
    },
    renameNode: (nodeId, title) => {
      const trimmedTitle = title.trim();
      if (!trimmedTitle) return;
      set((state) => ({
        ...withHistory(state),
        nodes: state.nodes.map((node) => (
          node.id === nodeId ? { ...node, data: { ...node.data, title: trimmedTitle } as ProductionNodeData } : node
        )),
      }));
    },
    resizeNode: (nodeId, size) => {
      set((state) => {
        const node = state.nodes.find((item) => item.id === nodeId);
        if (!node || node.locked) return {};
        return {
          ...withHistory(state),
          nodes: state.nodes.map((item) => (
            item.id === nodeId
              ? { ...item, size: { ...item.size, ...size } }
              : item
          )),
        };
      });
    },
    resizeNodeFrame: (nodeId, frame) => {
      set((state) => {
        const node = state.nodes.find((item) => item.id === nodeId);
        if (!node || node.locked) return {};
        return {
          ...withHistory(state),
          nodes: state.nodes.map((item) => (
            item.id === nodeId
              ? { ...item, position: frame.position, size: frame.size }
              : item
          )),
        };
      });
    },
    toggleNodeLock: (nodeId) => {
      set((state) => ({
        ...withHistory(state),
        nodes: state.nodes.map((node) => (node.id === nodeId ? { ...node, locked: !node.locked } : node)),
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
    updateNodeDataSilent: (nodeId, data) => {
      set((state) => ({
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

function hasClearableGenerationData(node: ProductionNode) {
  const data = node.data as unknown as Record<string, unknown>;
  if (node.type === 'generateImage' || node.type === 'refineImage') {
    return Boolean(data.resultAssetId) || (Array.isArray(data.resultAssetIds) && data.resultAssetIds.length > 0);
  }
  if (node.type === 'textGeneration') {
    return Boolean(data.result) || (Array.isArray(data.resultTexts) && data.resultTexts.length > 0);
  }
  if (node.type === 'textToSpeech') {
    return Boolean(data.resultAssetId) || (Array.isArray(data.resultAssetIds) && data.resultAssetIds.length > 0);
  }
  if (node.type === 'subjectBuilder' || node.type === 'locationBuilder') {
    return Array.isArray(data.libraryImageAssetIds) && data.libraryImageAssetIds.length > 0;
  }
  return Boolean(data.resultAssetId);
}

function getClearedGenerationData(node: ProductionNode): Partial<ProductionNodeData> {
  if (node.type === 'generateImage' || node.type === 'refineImage') {
    return {
      activeResultIndex: -1,
      resultAssetId: undefined,
      resultAssetIds: [],
      resultMetadata: {},
      generationRequest: undefined,
      message: '',
    } as Partial<ProductionNodeData>;
  }
  if (node.type === 'textGeneration') {
    return {
      activeResultIndex: -1,
      disabledResultFilterIds: [],
      result: '',
      resultTexts: [],
      message: '',
    } as Partial<ProductionNodeData>;
  }
  if (node.type === 'textToSpeech') {
    return {
      activeResultIndex: -1,
      resultAssetId: undefined,
      resultAssetIds: [],
      resultMetadata: {},
      message: '',
    } as Partial<ProductionNodeData>;
  }
  if (node.type === 'subjectBuilder') {
    return {
      libraryImageAssetIds: [],
      referenceGenerationRequests: {},
      message: '',
    } as Partial<ProductionNodeData>;
  }
  if (node.type === 'locationBuilder') {
    return {
      libraryImageAssetIds: [],
      message: '',
    } as Partial<ProductionNodeData>;
  }
  return {
    resultAssetId: undefined,
    message: '',
  } as Partial<ProductionNodeData>;
}
