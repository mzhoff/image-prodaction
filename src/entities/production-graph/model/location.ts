import type { LocationPreserveStrength, LocationType } from './types';

export const LOCATION_TYPES: LocationType[] = ['interior', 'exterior', 'urban', 'nature', 'studio', 'abstract'];
export const LOCATION_PRESERVE_STRENGTHS: LocationPreserveStrength[] = ['strict', 'balanced', 'flexible'];

export function normalizeLocationType(value: unknown): LocationType {
  return LOCATION_TYPES.includes(value as LocationType) ? value as LocationType : 'interior';
}

export function normalizeLocationPreserveStrength(value: unknown): LocationPreserveStrength {
  return LOCATION_PRESERVE_STRENGTHS.includes(value as LocationPreserveStrength) ? value as LocationPreserveStrength : 'balanced';
}
