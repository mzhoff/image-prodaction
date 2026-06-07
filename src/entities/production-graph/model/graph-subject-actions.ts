import { createId } from '@/shared/lib/id';
import { getIncomingImageInputs, getIncomingTextInputs } from './graph-io';
import { withHistory } from './graph-history';
import { buildSubjectPassportText, subjectTypeLabels } from './subject-passport';
import { normalizeSubjectPreserveStrength, normalizeSubjectType } from './subject';
import type { ProductionGraphState } from './store-types';
import type { StoreGet, StoreSet } from './store-action-types';
import type { ProductionNodeData, SubjectBuilderNodeData, SubjectRecord } from './types';

export function createGraphSubjectActions(set: StoreSet, get: StoreGet): Pick<
  ProductionGraphState,
  'applySubjectToNode' | 'publishSubjectFromNode'
> {
  return {
    applySubjectToNode: (nodeId, subjectId) => {
      const state = get();
      const subject = state.subjects.find((item) => item.id === subjectId);
      const node = state.nodes.find((item) => item.id === nodeId);
      if (!subject) return { ok: false, reason: 'Subject не найден в библиотеке.' };
      if (node?.type !== 'subjectBuilder') return { ok: false, reason: 'Subject можно загрузить только в Subject Builder.' };

      set((current) => ({
        ...withHistory(current),
        nodes: current.nodes.map((item) => (
          item.id === nodeId
            ? {
                ...item,
                data: {
                  ...item.data,
                  identitySummary: subject.identitySummary,
                  immutableTraits: subject.immutableTraits,
                  libraryImageAssetIds: subject.imageAssetIds,
                  librarySubjectId: subject.id,
                  libraryUpdatedAt: subject.updatedAt,
                  message: `Loaded ${subject.title} from subject library.`,
                  mutableAttributes: subject.mutableAttributes,
                  name: subject.name,
                  negativeConstraints: subject.negativeConstraints,
                  notes: subject.notes,
                  preserveStrength: subject.preserveStrength,
                  result: subject.passportText,
                  sourceCount: subject.imageAssetIds.length,
                  subjectType: subject.subjectType,
                } as ProductionNodeData,
              }
            : item
        )),
      }));

      return { ok: true };
    },
    publishSubjectFromNode: (nodeId) => {
      const state = get();
      const node = state.nodes.find((item) => item.id === nodeId);
      if (node?.type !== 'subjectBuilder') return { ok: false, reason: 'Publish доступен только для Subject Builder.' };

      const data = node.data as SubjectBuilderNodeData;
      const textInputs = getIncomingTextInputs(node.id, 'text', state);
      const imageInputs = getIncomingImageInputs(node.id, 'image', state);
      const imageAssetIds = uniqueStrings(data.libraryImageAssetIds ?? []);

      if (!hasPublishableSubjectContent(data, textInputs.length, imageInputs.length + imageAssetIds.length)) {
        return { ok: false, reason: 'Добавьте имя, описание, текстовый input или image refs перед публикацией субъекта.' };
      }

      const existingSubject = data.librarySubjectId
        ? state.subjects.find((item) => item.id === data.librarySubjectId)
        : undefined;
      const now = new Date().toISOString();
      const subjectId = existingSubject?.id ?? createId('subject');
      const subjectType = normalizeSubjectType(data.subjectType);
      const preserveStrength = normalizeSubjectPreserveStrength(data.preserveStrength);
      const passportText = buildSubjectPassportText(data, textInputs.map((input) => ({
        label: input.sourceLabel,
        text: input.text,
      }))).trim();
      const title = data.name.trim() || existingSubject?.title || `${subjectTypeLabels[subjectType]} subject`;
      const subject: SubjectRecord = {
        id: subjectId,
        createdAt: existingSubject?.createdAt ?? now,
        identitySummary: data.identitySummary,
        imageAssetIds,
        immutableTraits: data.immutableTraits,
        mutableAttributes: data.mutableAttributes,
        name: data.name,
        negativeConstraints: data.negativeConstraints,
        notes: data.notes,
        passportText,
        preserveStrength,
        sourceNodeId: node.id,
        subjectType,
        title,
        updatedAt: now,
      };

      set((current) => ({
        ...withHistory(current),
        nodes: current.nodes.map((item) => (
          item.id === nodeId
            ? {
                ...item,
                data: {
                  ...item.data,
                  libraryImageAssetIds: imageAssetIds,
                  librarySubjectId: subjectId,
                  libraryUpdatedAt: now,
                  message: existingSubject ? `Updated ${subject.title} in subject library.` : `Published ${subject.title} to subject library.`,
                  preserveStrength,
                  result: passportText,
                  sourceCount: textInputs.length + imageInputs.length + imageAssetIds.length,
                  subjectType,
                } as ProductionNodeData,
              }
            : item
        )),
        subjects: current.subjects.some((item) => item.id === subjectId)
          ? current.subjects.map((item) => (item.id === subjectId ? subject : item))
          : [subject, ...current.subjects],
      }));

      return { ok: true, subject };
    },
  };
}

function hasPublishableSubjectContent(data: SubjectBuilderNodeData, textInputCount: number, imageInputCount: number) {
  return Boolean(
    data.name.trim()
    || data.identitySummary.trim()
    || data.immutableTraits.trim()
    || data.mutableAttributes.trim()
    || data.negativeConstraints.trim()
    || data.notes.trim()
    || textInputCount > 0
    || imageInputCount > 0
  );
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}
