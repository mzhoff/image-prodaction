import type { GraphProject, ProductionNode } from './types';
import { PROJECT_SCHEMA_VERSION } from './project-schema';

export const initialNodes: ProductionNode[] = [];

export const initialProject: GraphProject = {
  version: PROJECT_SCHEMA_VERSION,
  nodes: initialNodes,
  sections: [],
  edges: [],
  assets: [],
  presets: [],
  subjects: [],
  locations: [],
  publications: [],
  runs: [],
  selectedNodeIds: [],
  selectedSectionIds: [],
};
