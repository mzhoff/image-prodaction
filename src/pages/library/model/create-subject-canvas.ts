import { createDefaultNode } from '@/entities/production-graph/model/create-default-node';
import { initialProject } from '@/entities/production-graph/model/initial-project';
import { createEmptyProjectUiState, createProjectExport } from '@/entities/production-graph/model/project-schema';
import type { LibrarySubjectProfile } from '@/entities/production-graph/model/subject-profile';
import { hydrateLibrarySubject } from '@/entities/production-graph/api/subject-library-api';
import { createWorkspaceProject } from '@/entities/workspace/api/workspace-api';
import { saveDocumentProjectSnapshot } from '@/entities/document/api/document-api';

export async function createSubjectCanvas(profile: LibrarySubjectProfile,
  pending: { current: { id: string; revision: number } | null }) {
  const hydrated = await hydrateLibrarySubject(profile);
  if (hydrated.strippedAssetReferenceCount) throw new Error('Удалите недоступные референсы из паспорта перед созданием канваса.');
  if (!pending.current) {
    const created = await createWorkspaceProject(profile.workspaceId, `Персонаж · ${profile.name}`);
    pending.current = { id: created.id, revision: created.revision ?? 0 };
  }
  const node = createDefaultNode('subjectBuilder', { x: 0, y: 0 });
  node.data = hydrated.data;
  const snapshot = createProjectExport({ ...initialProject, nodes: [node], assets: hydrated.assets }, createEmptyProjectUiState());
  await saveDocumentProjectSnapshot(pending.current.id, snapshot, pending.current.revision);
  return pending.current.id;
}
