import type { ProjectExport } from '@/entities/production-graph/model/project-schema';

export const DEFAULT_DOCUMENT_NAME = 'Untitled Pipeline';

interface UntouchedDocumentState {
  favorite: boolean;
  hasEverHadContent: boolean;
  name: string;
  status: 'active' | 'trash';
  thumbnailAvailable: boolean;
}

export function documentSnapshotHasContent(snapshot: ProjectExport) {
  const project = snapshot.project;
  return project.nodes.length > 0
    || project.sections.length > 0
    || project.edges.length > 0
    || project.assets.length > 0
    || project.presets.length > 0
    || project.subjects.length > 0
    || project.locations.length > 0
    || project.publications.length > 0
    || project.runs.length > 0;
}

export function isDisposableUntouchedDocument(document: UntouchedDocumentState) {
  return document.status === 'active'
    && document.name === DEFAULT_DOCUMENT_NAME
    && document.favorite === false
    && document.hasEverHadContent === false
    && document.thumbnailAvailable === false;
}
