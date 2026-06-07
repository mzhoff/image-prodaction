import type { StateStorage } from 'zustand/middleware';
import type { ProductionGraphState } from './store-types';

export const GRAPH_PERSIST_STORAGE_KEY = 'reverie-image-production-project:v1';

const GRAPH_PERSIST_BACKUP_KEY = `${GRAPH_PERSIST_STORAGE_KEY}:backup`;
const GRAPH_PERSIST_LATEST_KEY = `${GRAPH_PERSIST_STORAGE_KEY}:latest`;
const MAX_PERSISTED_STRING_LENGTH = 100_000;

interface PersistedGraphStats {
  assetCount: number;
  edgeCount: number;
  locationCount: number;
  nodeCount: number;
  publicationCount: number;
  raw: string;
  sectionCount: number;
  subjectCount: number;
}

export function createPersistedGraphState(state: ProductionGraphState) {
  return {
    version: state.version,
    nodes: sanitizePersistedValue(state.nodes.map(resetPersistedNodeRuntimeStatus)),
    sections: state.sections,
    edges: state.edges,
    assets: state.assets,
    presets: state.presets,
    subjects: state.subjects,
    locations: state.locations,
    publications: state.publications,
    runs: state.runs,
    selectedNodeIds: state.selectedNodeIds,
    selectedSectionIds: state.selectedSectionIds,
    uiState: state.uiState,
  };
}

function resetPersistedNodeRuntimeStatus(node: ProductionGraphState['nodes'][number]) {
  return node.status === 'running' ? { ...node, status: 'idle' } : node;
}

export function createGraphPersistStorage(): StateStorage {
  const storage = getLocalStorage();

  return {
    getItem: (name) => {
      if (!storage) return null;
      const primary = safeGet(storage, name);
      const primaryStats = getPersistedGraphStats(primary);
      const fallback = findBestFallback(storage);

      if (!primaryStats) return fallback?.raw ?? primary;
      if (isDefaultLikeGraph(primaryStats) && fallback && isMeaningfulGraph(fallback)) return fallback.raw;
      return primary;
    },
    setItem: (name, value) => {
      if (!storage) return;
      const current = safeGet(storage, name);
      const currentStats = getPersistedGraphStats(current);
      const nextStats = getPersistedGraphStats(value);

      if (currentStats && isMeaningfulGraph(currentStats)) {
        safeSet(storage, GRAPH_PERSIST_BACKUP_KEY, currentStats.raw);
      }

      try {
        storage.setItem(name, value);
        if (nextStats && isMeaningfulGraph(nextStats)) {
          safeSet(storage, GRAPH_PERSIST_LATEST_KEY, value);
        }
      } catch (error) {
        safeRemove(storage, GRAPH_PERSIST_BACKUP_KEY);
        try {
          storage.setItem(name, value);
        } catch {
          console.warn('Reverie project autosave failed. Export a project snapshot to preserve the current graph.', error);
        }
      }
    },
    removeItem: (name) => {
      if (!storage) return;
      safeRemove(storage, name);
    },
  };
}

export function clearGraphPersistBackups() {
  const storage = getLocalStorage();
  if (!storage) return;
  safeRemove(storage, GRAPH_PERSIST_BACKUP_KEY);
  safeRemove(storage, GRAPH_PERSIST_LATEST_KEY);
}

function sanitizePersistedValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizePersistedValue);
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string' && (value.startsWith('data:') || value.length > MAX_PERSISTED_STRING_LENGTH)) return undefined;
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !key.endsWith('DataUrl'))
      .map(([key, entryValue]) => [key, sanitizePersistedValue(entryValue)])
      .filter(([, entryValue]) => entryValue !== undefined),
  );
}

function findBestFallback(storage: Storage) {
  const backups = [
    getPersistedGraphStats(safeGet(storage, GRAPH_PERSIST_LATEST_KEY)),
    getPersistedGraphStats(safeGet(storage, GRAPH_PERSIST_BACKUP_KEY)),
  ].filter((stats): stats is PersistedGraphStats => Boolean(stats));

  return backups
    .filter(isMeaningfulGraph)
    .sort((a, b) => graphScore(b) - graphScore(a))[0] ?? null;
}

function getPersistedGraphStats(raw: string | null): PersistedGraphStats | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return null;
    const state = isRecord(parsed.state) ? parsed.state : parsed;
    const nodes = Array.isArray(state.nodes) ? state.nodes : null;
    const edges = Array.isArray(state.edges) ? state.edges : null;
    if (!nodes || !edges) return null;

    return {
      assetCount: Array.isArray(state.assets) ? state.assets.length : 0,
      edgeCount: edges.length,
      locationCount: Array.isArray(state.locations) ? state.locations.length : 0,
      nodeCount: nodes.length,
      publicationCount: Array.isArray(state.publications) ? state.publications.length : 0,
      raw,
      sectionCount: Array.isArray(state.sections) ? state.sections.length : 0,
      subjectCount: Array.isArray(state.subjects) ? state.subjects.length : 0,
    };
  } catch {
    return null;
  }
}

function isDefaultLikeGraph(stats: PersistedGraphStats) {
  return stats.nodeCount <= 4
    && stats.edgeCount <= 4
    && stats.assetCount === 0
    && stats.sectionCount === 0
    && stats.subjectCount === 0
    && stats.locationCount === 0
    && stats.publicationCount === 0;
}

function isMeaningfulGraph(stats: PersistedGraphStats) {
  return !isDefaultLikeGraph(stats);
}

function graphScore(stats: PersistedGraphStats) {
  return stats.nodeCount * 10
    + stats.edgeCount
    + stats.assetCount * 20
    + stats.sectionCount * 5
    + stats.subjectCount * 10
    + stats.locationCount * 10
    + stats.publicationCount * 10;
}

function getLocalStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function safeGet(storage: Storage, key: string) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(storage: Storage, key: string, value: string) {
  try {
    storage.setItem(key, value);
  } catch {
    // Backup writes are best-effort only.
  }
}

function safeRemove(storage: Storage, key: string) {
  try {
    storage.removeItem(key);
  } catch {
    // Storage cleanup is best-effort only.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
