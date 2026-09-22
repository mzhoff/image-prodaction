import { isUuidV7 } from '@/shared/lib/id';
import type { SubjectLibraryItem, SubjectProfileFields } from '@/entities/production-graph/model/subject-profile';

export type HomeSubjectChoice = SubjectLibraryItem & { subjectType?: SubjectProfileFields['subjectType'] };

/** The Workspace catalog is universal: people, characters, products, places, and other subjects. */
export async function loadHomeSubjects(workspaceId: string, signal: AbortSignal): Promise<HomeSubjectChoice[]> {
  const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/subjects`, {
    cache: 'no-store', credentials: 'same-origin', redirect: 'error',
    signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
  });
  if (!response.ok) throw new Error('Не удалось загрузить героев. Повторите попытку.');
  const body = await response.json() as { subjects?: unknown };
  if (!Array.isArray(body.subjects)) throw new Error('Не удалось загрузить героев. Повторите попытку.');
  return body.subjects.flatMap((value): HomeSubjectChoice[] => {
    if (!value || typeof value !== 'object') return [];
    const item = value as Record<string, unknown>;
    if (!isUuidV7(item.id) || item.workspaceId !== workspaceId || typeof item.name !== 'string') return [];
    return [{ id: item.id, workspaceId, name: item.name, title: item.name,
      subjectType: typeof item.subjectType === 'string' && ['person', 'character', 'product', 'object', 'vehicle', 'animal', 'place'].includes(item.subjectType)
        ? item.subjectType as SubjectProfileFields['subjectType'] : undefined,
      identitySummary: typeof item.identitySummary === 'string' ? item.identitySummary : '',
      imageAssetIds: Array.isArray(item.imageAssetIds) ? item.imageAssetIds.filter(isUuidV7) : [],
    }];
  });
}
