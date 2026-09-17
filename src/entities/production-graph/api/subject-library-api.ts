import { mapRemoteImageAsset, type RemoteImageAssetDto } from '../lib/remote-asset';
import type { LibrarySubjectProfile, SubjectProfileFields } from '../model/subject-profile';
import { subjectFieldsToNode } from '../model/subject-profile';
import { hydrateNodeTemplateAssets } from './node-template-assets';

export async function subjectLibraryRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin', ...init });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || 'Не удалось загрузить библиотеку персонажей.');
  return payload as T;
}

export const subjectLibraryUrl = (workspaceId: string, id?: string) =>
  `/api/workspaces/${encodeURIComponent(workspaceId)}/subjects${id ? `/${encodeURIComponent(id)}` : ''}`;

export async function fetchSubjectProfile(workspaceId: string, id: string, signal?: AbortSignal) {
  return (await subjectLibraryRequest<{ subject: LibrarySubjectProfile }>(subjectLibraryUrl(workspaceId, id), { signal })).subject;
}

export async function saveLibrarySubject(workspaceId: string, id: string, expectedRevision: number,
  fields: SubjectProfileFields, sourceDocumentId?: string) {
  return (await subjectLibraryRequest<{ subject: LibrarySubjectProfile }>(subjectLibraryUrl(workspaceId, id), {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields, expectedRevision, sourceDocumentId }),
  })).subject;
}

export async function hydrateLibrarySubject(profile: LibrarySubjectProfile, signal?: AbortSignal) {
  const hydrated = await hydrateNodeTemplateAssets({ version: 1, nodeType: 'subjectBuilder',
    data: subjectFieldsToNode(profile) }, profile.workspaceId, signal);
  return { ...hydrated, data: { ...hydrated.snapshot.data, librarySubjectId: profile.id,
    libraryUpdatedAt: profile.updatedAt, libraryRevision: profile.revision } };
}

export async function uploadSubjectReference(workspaceId: string, file: File) {
  const body = new FormData();
  body.set('file', file); body.set('workspaceId', workspaceId); body.set('origin', 'uploaded');
  const result = await subjectLibraryRequest<{ asset: RemoteImageAssetDto }>('/api/assets/images', { method: 'POST', body });
  return mapRemoteImageAsset(result.asset);
}
