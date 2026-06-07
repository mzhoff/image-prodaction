import type { SubjectPreserveStrength, SubjectType } from './types';

export const SUBJECT_TYPES: SubjectType[] = ['person', 'character', 'product', 'object', 'vehicle', 'animal', 'place'];
export const SUBJECT_PRESERVE_STRENGTHS: SubjectPreserveStrength[] = ['strict', 'balanced', 'flexible'];

export function normalizeSubjectType(value: unknown): SubjectType {
  return SUBJECT_TYPES.includes(value as SubjectType) ? value as SubjectType : 'person';
}

export function normalizeSubjectPreserveStrength(value: unknown): SubjectPreserveStrength {
  return SUBJECT_PRESERVE_STRENGTHS.includes(value as SubjectPreserveStrength) ? value as SubjectPreserveStrength : 'balanced';
}
