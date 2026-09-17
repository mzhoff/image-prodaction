import { z } from 'zod';
import { isUuidV7 } from '@/shared/lib/id';
import { buildSubjectPassportText } from './subject-passport';
import type { SubjectRecord, SubjectBuilderNodeData } from './types';

export const subjectProfileFields = z.object({
  name: z.string().trim().min(1).max(120),
  subjectType: z.enum(['person', 'character', 'product', 'object', 'vehicle', 'animal', 'place']),
  preserveStrength: z.enum(['strict', 'balanced', 'flexible']),
  identitySummary: z.string().max(10000),
  immutableTraits: z.string().max(10000),
  mutableAttributes: z.string().max(10000),
  negativeConstraints: z.string().max(10000),
  notes: z.string().max(10000),
  imageAssetIds: z.array(z.string().refine(isUuidV7)).max(24).transform((ids) => [...new Set(ids)]),
}).strict();

export type SubjectProfileFields = z.infer<typeof subjectProfileFields>;
export interface LibrarySubjectProfile extends SubjectRecord {
  workspaceId: string;
  revision: number;
  sourceDocumentId: string | null;
}
export type SubjectLibraryItem = Pick<LibrarySubjectProfile, 'id' | 'workspaceId' | 'name' | 'title' | 'identitySummary' | 'imageAssetIds'>;

export function subjectFieldsToNode(fields: SubjectProfileFields): SubjectBuilderNodeData {
  const { imageAssetIds, ...data } = profileFields(fields);
  return { ...data, title: 'Subject Builder', libraryImageAssetIds: imageAssetIds };
}

export function buildLibrarySubject(fields: SubjectProfileFields, metadata: Pick<LibrarySubjectProfile,
  'id' | 'workspaceId' | 'revision' | 'sourceDocumentId' | 'createdAt' | 'updatedAt'>): LibrarySubjectProfile {
  return { ...fields, ...metadata, title: fields.name, passportText: buildSubjectPassportText(subjectFieldsToNode(fields)) };
}

export const emptySubjectProfile: SubjectProfileFields = {
  name: '', subjectType: 'character', preserveStrength: 'balanced', identitySummary: '',
  immutableTraits: '', mutableAttributes: '', negativeConstraints: '', notes: '', imageAssetIds: [],
};

export function profileFields(profile: SubjectProfileFields): SubjectProfileFields {
  return { name: profile.name, subjectType: profile.subjectType, preserveStrength: profile.preserveStrength,
    identitySummary: profile.identitySummary, immutableTraits: profile.immutableTraits,
    mutableAttributes: profile.mutableAttributes, negativeConstraints: profile.negativeConstraints,
    notes: profile.notes, imageAssetIds: profile.imageAssetIds };
}
