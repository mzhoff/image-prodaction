import { validateDocumentSnapshot } from './document-validation';
import { DOCUMENT_OVERVIEW_VERSION, hasDocumentOverview } from '../model/document-overview';

export function toDocumentDto(row: {
  createdAt: Date;
  favorite: boolean | null;
  hasEverHadContent: boolean;
  id: string;
  name: string;
  revision: number;
  folderId: string | null;
  librarySaved: boolean;
  schemaVersion: number;
  snapshot: unknown | null;
  status: 'active' | 'trash';
  thumbnailAssetId: string | null;
  thumbnailMode: 'auto' | 'manual';
  thumbnailUpdatedAt: Date | null;
  updatedAt: Date;
  workspaceId: string;
}) {
  const snapshot = row.snapshot === null ? undefined : validateDocumentSnapshot(row.snapshot);
  const thumbnailUrl = row.thumbnailAssetId
    ? `/api/assets/${row.thumbnailAssetId}/content?variant=thumbnail`
    : hasDocumentOverview(snapshot)
      ? `/api/projects/${row.id}/thumbnail?revision=${row.revision}&renderer=${DOCUMENT_OVERVIEW_VERSION}`
      : '';
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    folderId: row.folderId,
    librarySaved: row.librarySaved,
    thumbnailUrl,
    thumbnailMode: row.thumbnailMode,
    thumbnailAvailable: Boolean(thumbnailUrl),
    hasEverHadContent: row.hasEverHadContent,
    thumbnailUpdatedAt: row.thumbnailUpdatedAt?.toISOString(),
    favorite: row.favorite ?? false,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    revision: row.revision,
    schemaVersion: row.schemaVersion,
    snapshot,
  };
}
