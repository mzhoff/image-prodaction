import {
  createPipelineTemplateExport,
  createProjectSnapshotExport,
  normalizePortableProjectExport,
} from './project-portability';
import { createId } from '@/shared/lib/id';
import { withHistory } from './graph-history';
import { getSectionAndDescendantIds } from './graph-section-layout';
import { getNodeIdsInsideSectionTree } from './graph-section-membership';
import type { ProductionGraphState } from './store-types';
import type { StoreGet, StoreSet } from './store-action-types';
import type { GraphPoint, GraphProject, ProductionNodeData } from './types';

export function createGraphPortabilityActions(set: StoreSet, get: StoreGet): Pick<
  ProductionGraphState,
  'exportPipelineTemplate' | 'exportPipelineTemplateForSection' | 'exportProjectSnapshot' | 'importPipelineTemplateAt' | 'importPortableProject'
> {
  return {
    exportProjectSnapshot: () => createProjectSnapshotExport(getGraphProject(get()), get().uiState),
    exportPipelineTemplate: () => createPipelineTemplateExport(getGraphProject(get()), get().uiState),
    exportPipelineTemplateForSection: (sectionId) => createPipelineTemplateExport(
      getSectionPipelineProject(get(), sectionId),
      get().uiState,
    ),
    importPipelineTemplateAt: (payload, position) => {
      const imported = normalizePortableProjectExport(payload);
      if (imported.kind !== 'pipelineTemplate') {
        throw new Error(getPortableKindMismatchMessage('pipelineTemplate'));
      }

      const { project, uiState } = imported;
      if (project.nodes.length === 0) {
        return { kind: imported.kind, nodeCount: 0 };
      }

      const origin = getPipelineOrigin(project);
      const offset = { x: position.x - origin.x, y: position.y - origin.y };
      const nodeIdMap = new Map(project.nodes.map((node) => [node.id, createId('node')]));
      const sectionIdMap = new Map(project.sections.map((section) => [section.id, createId('section')]));
      const subjectIdMap = new Map(project.subjects.map((subject) => [subject.id, createId('subject')]));
      const locationIdMap = new Map(project.locations.map((location) => [location.id, createId('location')]));
      const presetIdMap = new Map(project.presets.map((preset) => [preset.id, createId('preset')]));

      const nextNodes = project.nodes.map((node) => {
        const nextId = nodeIdMap.get(node.id) ?? createId('node');
        return {
          ...node,
          id: nextId,
          position: {
            x: node.position.x + offset.x,
            y: node.position.y + offset.y,
          },
          data: remapPipelineNodeData(node.data, nodeIdMap, subjectIdMap, locationIdMap),
        };
      });
      const nextSections = project.sections.map((section) => ({
        ...section,
        id: sectionIdMap.get(section.id) ?? createId('section'),
        parentId: section.parentId ? sectionIdMap.get(section.parentId) : undefined,
        position: {
          x: section.position.x + offset.x,
          y: section.position.y + offset.y,
        },
      }));
      const nextEdges = project.edges
        .filter((edge) => nodeIdMap.has(edge.sourceNodeId) && nodeIdMap.has(edge.targetNodeId))
        .map((edge) => ({
          ...edge,
          id: createId('edge'),
          sourceNodeId: nodeIdMap.get(edge.sourceNodeId) ?? edge.sourceNodeId,
          targetNodeId: nodeIdMap.get(edge.targetNodeId) ?? edge.targetNodeId,
        }));
      const nextSubjects = project.subjects.map((subject) => ({
        ...subject,
        id: subjectIdMap.get(subject.id) ?? createId('subject'),
        imageAssetIds: [],
        sourceNodeId: subject.sourceNodeId ? nodeIdMap.get(subject.sourceNodeId) : undefined,
      }));
      const nextLocations = project.locations.map((location) => ({
        ...location,
        id: locationIdMap.get(location.id) ?? createId('location'),
        imageAssetIds: [],
        sourceNodeId: location.sourceNodeId ? nodeIdMap.get(location.sourceNodeId) : undefined,
      }));
      const nextPresets = project.presets.map((preset) => ({
        ...preset,
        id: presetIdMap.get(preset.id) ?? createId('preset'),
        sourceAssetId: undefined,
      }));
      const nextNodeUiState = Object.fromEntries(
        Object.entries(uiState.nodes)
          .flatMap(([id, state]) => {
            const nextId = nodeIdMap.get(id);
            return nextId ? [[nextId, state]] : [];
          }),
      );
      const nextSectionUiState = Object.fromEntries(
        Object.entries(uiState.sections)
          .flatMap(([id, state]) => {
            const nextId = sectionIdMap.get(id);
            return nextId ? [[nextId, state]] : [];
          }),
      );

      set((state) => ({
        ...withHistory(state),
        nodes: [...state.nodes, ...nextNodes],
        sections: [...state.sections, ...nextSections],
        edges: [...state.edges, ...nextEdges],
        presets: [...nextPresets, ...state.presets],
        subjects: [...nextSubjects, ...state.subjects],
        locations: [...nextLocations, ...state.locations],
        selectedNodeIds: nextNodes.map((node) => node.id),
        selectedSectionIds: [],
        historyFuture: [],
        uiState: {
          ...state.uiState,
          nodes: {
            ...state.uiState.nodes,
            ...nextNodeUiState,
          },
          sections: {
            ...state.uiState.sections,
            ...nextSectionUiState,
          },
        },
      }));

      return { kind: imported.kind, nodeCount: nextNodes.length };
    },
    importPortableProject: (payload, expectedKind) => {
      const imported = normalizePortableProjectExport(payload);
      if (expectedKind && imported.kind !== expectedKind) {
        throw new Error(getPortableKindMismatchMessage(expectedKind));
      }

      set((state) => ({
        ...withHistory(state),
        ...imported.project,
        uiState: imported.uiState,
        historyFuture: [],
      }));
      return { kind: imported.kind };
    },
  };
}

function getPipelineOrigin(project: Pick<GraphProject, 'nodes' | 'sections'>): GraphPoint {
  const positions = [
    ...project.nodes.map((node) => node.position),
    ...project.sections.map((section) => section.position),
  ];

  if (positions.length === 0) return { x: 0, y: 0 };

  return {
    x: Math.min(...positions.map((position) => position.x)),
    y: Math.min(...positions.map((position) => position.y)),
  };
}

function remapPipelineNodeData(
  data: ProductionNodeData,
  nodeIdMap: Map<string, string>,
  subjectIdMap: Map<string, string>,
  locationIdMap: Map<string, string>,
): ProductionNodeData {
  const next = { ...data } as Record<string, unknown>;

  if (typeof next.sourceNodeId === 'string') {
    next.sourceNodeId = nodeIdMap.get(next.sourceNodeId);
  }
  if (typeof next.librarySubjectId === 'string') {
    next.librarySubjectId = subjectIdMap.get(next.librarySubjectId);
  }
  if (typeof next.libraryLocationId === 'string') {
    next.libraryLocationId = locationIdMap.get(next.libraryLocationId);
  }

  if ('libraryImageAssetIds' in next) next.libraryImageAssetIds = [];
  delete next.assetId;
  delete next.activeImageAssetId;
  delete next.resultAssetId;
  delete next.resultAssetIds;
  delete next.resultMetadata;
  delete next.sourceAssetId;
  delete next.sourceAspectRatio;
  delete next.maskDataUrl;

  return next as unknown as ProductionNodeData;
}

function getPortableKindMismatchMessage(expectedKind: 'projectSnapshot' | 'pipelineTemplate') {
  return expectedKind === 'pipelineTemplate'
    ? 'Выбран project snapshot JSON. Нужен pipeline template JSON.'
    : 'Выбран pipeline template JSON. Нужен project snapshot JSON.';
}

function getSectionPipelineProject(state: ProductionGraphState, sectionId: string): GraphProject {
  const sectionIds = getSectionAndDescendantIds(state.sections, sectionId);
  const nodeIds = new Set(getNodeIdsInsideSectionTree(sectionId, state.sections, state.nodes));
  const nodes = state.nodes.filter((node) => nodeIds.has(node.id));
  const sections = state.sections.filter((section) => sectionIds.has(section.id));
  const edges = state.edges.filter((edge) => nodeIds.has(edge.sourceNodeId) && nodeIds.has(edge.targetNodeId));
  const referencedSubjectIds = getReferencedRecordIds(nodes, 'librarySubjectId');
  const referencedLocationIds = getReferencedRecordIds(nodes, 'libraryLocationId');
  const subjects = state.subjects.filter((subject) => (
    referencedSubjectIds.has(subject.id)
    || Boolean(subject.sourceNodeId && nodeIds.has(subject.sourceNodeId))
  ));
  const locations = state.locations.filter((location) => (
    referencedLocationIds.has(location.id)
    || Boolean(location.sourceNodeId && nodeIds.has(location.sourceNodeId))
  ));

  return {
    version: state.version,
    nodes,
    sections,
    edges,
    assets: [],
    presets: [],
    subjects,
    locations,
    publications: [],
    runs: [],
    selectedNodeIds: [],
    selectedSectionIds: [],
  };
}

function getGraphProject(state: ProductionGraphState): GraphProject {
  return {
    version: state.version,
    nodes: state.nodes,
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
  };
}

function getReferencedRecordIds(nodes: GraphProject['nodes'], field: 'librarySubjectId' | 'libraryLocationId') {
  return new Set(
    nodes
      .map((node) => (node.data as unknown as Record<string, unknown>)[field])
      .filter((value): value is string => typeof value === 'string' && value.length > 0),
  );
}
