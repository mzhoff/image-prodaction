import { initialProject } from './initial-project';
import { compactDynamicInputsForNodes } from './dynamic-input-slot';
import { PROJECT_SCHEMA_VERSION } from './project-schema';
import { normalizePublicationArtifacts } from './publication';
import { normalizeProjectEdge } from './normalize-project-edges';
import { canKeepSingleIncomingEdge } from './port-contract';
import { normalizeNode, normalizeNodeRuntimeStatus } from './normalize-project-node';
import { normalizeLocationRecords, normalizeSubjectRecords } from './normalize-project-records';
import { normalizeProjectSections } from './normalize-project-sections';
import type { GraphProject } from './types';

export function normalizeProject(project: GraphProject): GraphProject {
  const nodes = (project.nodes ?? []).map(normalizeNode).map(normalizeNodeRuntimeStatus);
  const normalizedEdges = (project.edges ?? []).map((edge) => normalizeProjectEdge(edge, nodes));
  const normalizedPortState = compactDynamicInputsForNodes(nodes, normalizedEdges);
  const nodesWithPortCounts = normalizedPortState.nodes;
  const edges = canKeepSingleIncomingEdge({
    edges: normalizedPortState.edges,
    nodes: nodesWithPortCounts,
  });
  const sections = normalizeProjectSections(project.sections ?? []);
  const sectionIds = new Set(sections.map((section) => section.id));
  const subjects = normalizeSubjectRecords(project.subjects ?? []);
  const locations = normalizeLocationRecords(project.locations ?? []);
  const publications = normalizePublicationArtifacts(project.publications);

  return {
    ...initialProject,
    ...project,
    nodes: nodesWithPortCounts,
    sections,
    edges,
    subjects,
    locations,
    publications,
    version: PROJECT_SCHEMA_VERSION,
    selectedNodeIds: project.selectedNodeIds ?? [],
    selectedSectionIds: (project.selectedSectionIds ?? []).filter((id) => sectionIds.has(id)),
  };
}
