import { normalizeLocationPreserveStrength, normalizeLocationType } from './location';
import { normalizeStringArray } from './normalize-project-values';
import { normalizeSubjectPreserveStrength, normalizeSubjectType } from './subject';
import type { LocationRecord, SubjectRecord } from './types';

export function normalizeSubjectRecords(subjects: SubjectRecord[]) {
  return subjects
    .filter((subject): subject is SubjectRecord => Boolean(subject?.id))
    .map((subject) => ({
      id: subject.id,
      createdAt: typeof subject.createdAt === 'string' ? subject.createdAt : new Date().toISOString(),
      identitySummary: subject.identitySummary ?? '',
      imageAssetIds: normalizeStringArray(subject.imageAssetIds),
      immutableTraits: subject.immutableTraits ?? '',
      mutableAttributes: subject.mutableAttributes ?? '',
      name: subject.name ?? '',
      negativeConstraints: subject.negativeConstraints ?? '',
      notes: subject.notes ?? '',
      passportText: subject.passportText ?? '',
      preserveStrength: normalizeSubjectPreserveStrength(subject.preserveStrength),
      sourceNodeId: typeof subject.sourceNodeId === 'string' ? subject.sourceNodeId : undefined,
      subjectType: normalizeSubjectType(subject.subjectType),
      title: subject.title || subject.name || 'Untitled subject',
      updatedAt: typeof subject.updatedAt === 'string' ? subject.updatedAt : new Date().toISOString(),
    }));
}

export function normalizeLocationRecords(locations: LocationRecord[]) {
  return locations
    .filter((location): location is LocationRecord => Boolean(location?.id))
    .map((location) => ({
      id: location.id,
      atmosphere: location.atmosphere ?? '',
      createdAt: typeof location.createdAt === 'string' ? location.createdAt : new Date().toISOString(),
      description: location.description ?? '',
      imageAssetIds: normalizeStringArray(location.imageAssetIds),
      locationType: normalizeLocationType(location.locationType),
      mutableAttributes: location.mutableAttributes ?? '',
      name: location.name ?? '',
      negativeConstraints: location.negativeConstraints ?? '',
      notes: location.notes ?? '',
      passportText: location.passportText ?? '',
      preserveStrength: normalizeLocationPreserveStrength(location.preserveStrength),
      sourceNodeId: typeof location.sourceNodeId === 'string' ? location.sourceNodeId : undefined,
      spatialLayout: location.spatialLayout ?? '',
      title: location.title || location.name || 'Untitled location',
      updatedAt: typeof location.updatedAt === 'string' ? location.updatedAt : new Date().toISOString(),
    }));
}
