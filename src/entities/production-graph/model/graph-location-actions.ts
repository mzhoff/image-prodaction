import { createId } from '@/shared/lib/id';
import { getIncomingImageInputs, getIncomingTextInputs } from './graph-io';
import { withHistory } from './graph-history';
import { buildLocationPassportText, locationTypeLabels } from './location-passport';
import { normalizeLocationPreserveStrength, normalizeLocationType } from './location';
import type { ProductionGraphState } from './store-types';
import type { StoreGet, StoreSet } from './store-action-types';
import type { LocationBuilderNodeData, LocationRecord, ProductionNodeData } from './types';

export function createGraphLocationActions(set: StoreSet, get: StoreGet): Pick<
  ProductionGraphState,
  'applyLocationToNode' | 'publishLocationFromNode'
> {
  return {
    applyLocationToNode: (nodeId, locationId) => {
      const state = get();
      const location = state.locations.find((item) => item.id === locationId);
      const node = state.nodes.find((item) => item.id === nodeId);
      if (!location) return { ok: false, reason: 'Location не найдена в библиотеке.' };
      if (node?.type !== 'locationBuilder') return { ok: false, reason: 'Location можно загрузить только в Location Builder.' };

      set((current) => ({
        ...withHistory(current),
        nodes: current.nodes.map((item) => (
          item.id === nodeId
            ? {
                ...item,
                data: {
                  ...item.data,
                  atmosphere: location.atmosphere,
                  description: location.description,
                  libraryImageAssetIds: location.imageAssetIds,
                  libraryLocationId: location.id,
                  libraryUpdatedAt: location.updatedAt,
                  locationType: location.locationType,
                  message: `Loaded ${location.title} from location library.`,
                  mutableAttributes: location.mutableAttributes,
                  name: location.name,
                  negativeConstraints: location.negativeConstraints,
                  notes: location.notes,
                  preserveStrength: location.preserveStrength,
                  result: location.passportText,
                  sourceCount: location.imageAssetIds.length,
                  spatialLayout: location.spatialLayout,
                } as ProductionNodeData,
              }
            : item
        )),
      }));

      return { ok: true };
    },
    publishLocationFromNode: (nodeId) => {
      const state = get();
      const node = state.nodes.find((item) => item.id === nodeId);
      if (node?.type !== 'locationBuilder') return { ok: false, reason: 'Publish доступен только для Location Builder.' };

      const data = node.data as LocationBuilderNodeData;
      const textInputs = getIncomingTextInputs(node.id, 'text', state);
      const imageInputs = getIncomingImageInputs(node.id, 'image', state);
      const imageAssetIds = uniqueStrings([
        ...(data.libraryImageAssetIds ?? []),
        ...imageInputs.map((input) => input.assetId),
      ]);

      if (!hasPublishableLocationContent(data, textInputs.length, imageAssetIds.length)) {
        return { ok: false, reason: 'Добавьте имя, описание, текстовый input или image refs перед публикацией локации.' };
      }

      const existingLocation = data.libraryLocationId
        ? state.locations.find((item) => item.id === data.libraryLocationId)
        : undefined;
      const now = new Date().toISOString();
      const locationId = existingLocation?.id ?? createId('location');
      const locationType = normalizeLocationType(data.locationType);
      const preserveStrength = normalizeLocationPreserveStrength(data.preserveStrength);
      const passportText = buildLocationPassportText(data, textInputs.map((input) => ({
        label: input.sourceLabel,
        text: input.text,
      }))).trim();
      const title = data.name.trim() || existingLocation?.title || `${locationTypeLabels[locationType]} location`;
      const location: LocationRecord = {
        id: locationId,
        atmosphere: data.atmosphere,
        createdAt: existingLocation?.createdAt ?? now,
        description: data.description,
        imageAssetIds,
        locationType,
        mutableAttributes: data.mutableAttributes,
        name: data.name,
        negativeConstraints: data.negativeConstraints,
        notes: data.notes,
        passportText,
        preserveStrength,
        sourceNodeId: node.id,
        spatialLayout: data.spatialLayout,
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
                  libraryLocationId: locationId,
                  libraryUpdatedAt: now,
                  locationType,
                  message: existingLocation ? `Updated ${location.title} in location library.` : `Published ${location.title} to location library.`,
                  preserveStrength,
                  result: passportText,
                  sourceCount: textInputs.length + imageAssetIds.length,
                } as ProductionNodeData,
              }
            : item
        )),
        locations: current.locations.some((item) => item.id === locationId)
          ? current.locations.map((item) => (item.id === locationId ? location : item))
          : [location, ...current.locations],
      }));

      return { ok: true, location };
    },
  };
}

function hasPublishableLocationContent(data: LocationBuilderNodeData, textInputCount: number, imageInputCount: number) {
  return Boolean(
    data.name.trim()
    || data.description.trim()
    || data.spatialLayout.trim()
    || data.atmosphere.trim()
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
