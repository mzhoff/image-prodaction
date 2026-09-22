'use client';
import { useTranslations } from '@/shared/i18n/use-translations';
import { useRef, useState, useSyncExternalStore } from 'react';
import { createUuidV7, isUuidV7 } from '@/shared/lib/id';
import { getActiveAssetScopeSnapshot, subscribeActiveAssetScope } from '@/entities/production-graph/lib/remote-asset';
import { persistAssetToLibrary } from '@/entities/production-graph/lib/persist-asset-to-library';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { subjectProfileFields } from '@/entities/production-graph/model/subject-profile';
import type { SubjectBuilderNodeData } from '@/entities/production-graph/model/types';
import { fetchSubjectProfile, hydrateLibrarySubject, saveLibrarySubject } from '@/entities/production-graph/api/subject-library-api';
import { rememberLibrarySubject, useSubjectLibrary } from '@/entities/production-graph/api/use-subject-library';

export function useSubjectLibraryActions(nodeId: string, data: SubjectBuilderNodeData, imageIds: string[], textNotes: string[]) {
  const tUi = useTranslations();
  const scope = useSyncExternalStore(subscribeActiveAssetScope, getActiveAssetScopeSnapshot, () => undefined);
  const library = useSubjectLibrary(scope?.workspaceId);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const run = async (operation: () => Promise<void>) => {
    if (inFlight.current) return; inFlight.current = true; setBusy(true);
    try { await operation(); }
    catch (error) { useProductionGraphStore.getState().updateNodeData(nodeId, { message: error instanceof Error ? error.message : tUi("Не удалось сохранить персонажа.") }); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const load = (id: string) => run(async () => {
    const graph = useProductionGraphStore.getState();
    if (!isUuidV7(id)) { graph.applySubjectToNode(nodeId, id); return; }
    if (!scope) throw new Error(tUi("Сначала откройте сохранённый канвас."));
    const profile = await fetchSubjectProfile(scope.workspaceId, id);
    const hydrated = await hydrateLibrarySubject(profile);
    if (getActiveAssetScopeSnapshot() !== scope) return;
    hydrated.assets.forEach(graph.addAsset);
    graph.updateNodeData(nodeId, { ...hydrated.data, message: hydrated.strippedAssetReferenceCount
      ? tUi("Паспорт загружен. Некоторые референсы удалены или недоступны.") : tUi("Паспорт загружен из библиотеки.") });
    rememberLibrarySubject(profile);
  });
  const save = () => run(async () => {
    if (!scope) throw new Error(tUi("Сначала откройте сохранённый канвас."));
    if (!data.name.trim()) throw new Error(tUi("Укажите имя персонажа перед сохранением."));
    if (imageIds.length > 24) throw new Error(tUi("В паспорте можно сохранить до 24 референсов."));
    const graph = useProductionGraphStore.getState();
    const ids: string[] = [];
    // Sequential uploads keep large local references from exhausting browser memory.
    for (const id of imageIds) {
      const asset = graph.assets.find((item) => item.id === id);
      if (!asset) throw new Error(tUi("Один из референсов недоступен."));
      if (getActiveAssetScopeSnapshot() !== scope) return;
      ids.push((await persistAssetToLibrary(asset)).id);
    }
    const notes = [data.notes, ...textNotes.filter((note) => note.trim() && !data.notes.includes(note))].filter(Boolean).join('\n\n');
    const fields = subjectProfileFields.parse({ name: data.name, subjectType: data.subjectType,
      preserveStrength: data.preserveStrength, identitySummary: data.identitySummary, immutableTraits: data.immutableTraits,
      mutableAttributes: data.mutableAttributes, negativeConstraints: data.negativeConstraints, notes, imageAssetIds: ids });
    const existing = data.librarySubjectId && isUuidV7(data.librarySubjectId);
    if (existing && !data.libraryRevision) throw new Error(tUi("Загрузите свежую версию паспорта из Library перед обновлением."));
    if (getActiveAssetScopeSnapshot() !== scope) return;
    const profile = await saveLibrarySubject(scope.workspaceId, existing ? data.librarySubjectId! : createUuidV7(),
      existing ? data.libraryRevision! : 0, fields, scope.documentId);
    rememberLibrarySubject(profile);
    if (getActiveAssetScopeSnapshot() !== scope) return;
    graph.updateNodeData(nodeId, { librarySubjectId: profile.id, libraryRevision: profile.revision,
      libraryUpdatedAt: profile.updatedAt, message: tUi("Персонаж сохранён в Library → Персонажи.") });
  });
  return { library, busy, load, save };
}
