import { createDefaultNode } from './create-default-node';
import { normalizeNode } from './normalize-project-node';
import type {
  GraphPoint,
  ProductionNode,
  ProductionNodeData,
  ProductionNodeType,
} from './types';

export const FAVORITE_NODE_PAYLOAD_VERSION = 1 as const;

export interface FavoriteNodeSnapshot {
  data: ProductionNodeData;
  nodeType: ProductionNodeType;
  version: typeof FAVORITE_NODE_PAYLOAD_VERSION;
}

export interface FavoriteNodePreset {
  createdAt: string;
  fingerprint: string;
  id: string;
  snapshot: FavoriteNodeSnapshot;
  updatedAt: string;
  workspaceId: string;
}

const ALLOWED_DATA_FIELDS = new Set([
  'activeChannel', 'activeImageAssetId', 'activeIndex', 'activeItemIndex',
  'activeKind', 'activeResultIndex', 'activeText', 'adjustment', 'align',
  'aspectRatio', 'assetId', 'atmosphere', 'background', 'backgroundColor', 'body', 'brushColor',
  'brushSize', 'caption', 'canvasHeight', 'canvasWidth', 'content', 'contentMode', 'contentUnitId',
  'composedPrompt', 'contrast', 'crop', 'cropStateVersion', 'cta', 'curves',
  'customSeparator', 'delimiter', 'description', 'disabledLayerIds',
  'disabledResultFilterIds', 'editorHeight', 'errorCorrectionLevel', 'exposure', 'fields', 'foregroundColor', 'format',
  'gamma', 'groups', 'highlights', 'identitySummary', 'immutableTraits',
  'instruction', 'items', 'language', 'layerOrder', 'layers',
  'libraryImageAssetIds', 'locationType', 'locked', 'localText', 'margin', 'mediaOrder',
  'messageRichText', 'messageRichTextSource', 'messageSourceText', 'messageText',
  'mode', 'model', 'mutableAttributes', 'name', 'negativeConstraints', 'notes',
  'opacity', 'optionalTextHeight', 'outputFormat', 'outputLabel', 'outputStyle', 'pixelSize', 'plainText',
  'platformId', 'prefix', 'preset', 'presetId', 'presets', 'preserveStrength',
  'prompt', 'publicationTitle', 'quality', 'radius', 'reasoning',
  'rednessReduction', 'referenceModel', 'responseFormat', 'result',
  'resultAssetId', 'resultAssetIds', 'resultMetadata', 'resultTexts', 'richText',
  'saturation', 'scale', 'schemaName', 'seed', 'selectedGroupId',
  'selectedLayerId', 'selectedLayerIds', 'separator', 'shadows', 'size', 'site',
  'slots', 'spatialLayout', 'speed', 'subjectType', 'suffix', 'temperature',
  'sourceAspectRatio', 'sourceAssetId', 'text', 'textareaHeight', 'textureAmount',
  'tint', 'title', 'toneSmoothing',
  'topP', 'variableDisplayMode', 'variables', 'voice',
]);

const SENSITIVE_KEY = /(authorization|api[-_]?key|credential|password|secret|token)/i;
const TRANSIENT_KEY = /^(createdAt|updatedAt|error|fingerprint|idempotencyKey|jobId|(?:source|target)?NodeId|request|runtimeStatus|status)$/i;
const MAX_NESTING_DEPTH = 12;
const MAX_COLLECTION_ITEMS = 500;

export function createFavoriteNodeSnapshot(
  node: Pick<ProductionNode, 'data' | 'type'>,
): FavoriteNodeSnapshot {
  const base = createDefaultNode(node.type, { x: 0, y: 0 });
  const normalized = normalizeNode({
    ...base,
    data: { ...base.data, ...node.data } as ProductionNodeData,
  });
  const source = normalized.data as unknown as Record<string, unknown>;
  const data = Object.fromEntries(
    Object.entries(source).flatMap(([key, value]) => {
      if (!ALLOWED_DATA_FIELDS.has(key)) return [];
      const safeValue = sanitizeFavoriteValue(value, key, 0);
      return safeValue === undefined ? [] : [[key, safeValue]];
    }),
  ) as unknown as ProductionNodeData;

  return { data, nodeType: node.type, version: FAVORITE_NODE_PAYLOAD_VERSION };
}

export function createNodeFromFavoriteSnapshot(
  snapshot: FavoriteNodeSnapshot,
  position: GraphPoint,
): ProductionNode {
  const base = createDefaultNode(snapshot.nodeType, position);
  return normalizeNode({
    ...base,
    data: {
      ...base.data,
      ...createFavoriteNodeSnapshot({ type: snapshot.nodeType, data: snapshot.data }).data,
    } as ProductionNodeData,
    locked: false,
    status: 'idle',
  });
}

export function favoriteNodeSnapshotsEqual(
  left: FavoriteNodeSnapshot,
  right: FavoriteNodeSnapshot,
) {
  return canonicalizeFavoriteSnapshot(left) === canonicalizeFavoriteSnapshot(right);
}

export function canonicalizeFavoriteSnapshot(snapshot: FavoriteNodeSnapshot) {
  return JSON.stringify(sortJsonValue(snapshot));
}

export function getFavoriteNodeAssetIds(snapshot: FavoriteNodeSnapshot) {
  const ids = new Set<string>();
  collectAssetIds(snapshot.data as unknown, undefined, ids);
  return [...ids];
}

export function filterFavoriteNodeAssetIds(
  snapshot: FavoriteNodeSnapshot,
  allowedAssetIds: ReadonlySet<string>,
): FavoriteNodeSnapshot {
  return createFavoriteNodeSnapshot({
    type: snapshot.nodeType,
    data: filterAssetValue(
      snapshot.data as unknown,
      undefined,
      allowedAssetIds,
    ) as ProductionNodeData,
  });
}

function sanitizeFavoriteValue(value: unknown, key: string, depth: number): unknown {
  if (depth > MAX_NESTING_DEPTH || SENSITIVE_KEY.test(key) || TRANSIENT_KEY.test(key)) {
    return undefined;
  }
  if (typeof value === 'string') {
    if (value.startsWith('blob:') || value.startsWith('data:')) return undefined;
    return value;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) {
    return value.slice(0, MAX_COLLECTION_ITEMS).flatMap((item, index) => {
      const safe = sanitizeFavoriteValue(item, String(index), depth + 1);
      return safe === undefined ? [] : [safe];
    });
  }
  if (!isPlainObject(value)) return undefined;

  return Object.fromEntries(
    Object.entries(value).slice(0, MAX_COLLECTION_ITEMS).flatMap(([nestedKey, nestedValue]) => {
      const safe = sanitizeFavoriteValue(nestedValue, nestedKey, depth + 1);
      return safe === undefined ? [] : [[nestedKey, safe]];
    }),
  );
}

function collectAssetIds(value: unknown, key: string | undefined, ids: Set<string>) {
  if (typeof value === 'string' && isAssetReferenceKey(key)) {
    ids.add(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectAssetIds(item, key, ids));
    return;
  }
  if (!isPlainObject(value)) return;
  if (key === 'resultMetadata') {
    Object.keys(value).forEach((assetId) => ids.add(assetId));
  }
  Object.entries(value).forEach(([nestedKey, nestedValue]) => {
    collectAssetIds(nestedValue, nestedKey, ids);
  });
}

function filterAssetValue(
  value: unknown,
  key: string | undefined,
  allowedAssetIds: ReadonlySet<string>,
): unknown {
  if (typeof value === 'string' && isAssetReferenceKey(key)) {
    return allowedAssetIds.has(value) ? value : undefined;
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const filtered = filterAssetValue(item, key, allowedAssetIds);
      return filtered === undefined ? [] : [filtered];
    });
  }
  if (!isPlainObject(value)) return value;
  const filtered = Object.fromEntries(Object.entries(value).flatMap(([nestedKey, nestedValue]) => {
    const next = filterAssetValue(nestedValue, nestedKey, allowedAssetIds);
    return next === undefined ? [] : [[nestedKey, next]];
  }));
  if (key === 'resultMetadata') {
    return Object.fromEntries(Object.entries(filtered).filter(([assetId]) => allowedAssetIds.has(assetId)));
  }
  return filtered;
}

function isAssetReferenceKey(key: string | undefined) {
  return Boolean(key && /assetIds?$/i.test(key));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, sortJsonValue(value[key])]),
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
