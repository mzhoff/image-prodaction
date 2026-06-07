'use client';

import { useEffect, useMemo, useState } from 'react';
import { loadAssetBlob } from '@/entities/production-graph/lib/asset-db';
import { getIncomingImageInputs, getIncomingTextInputs } from '@/entities/production-graph/model/graph-io';
import { normalizeLocationPreserveStrength, normalizeLocationType } from '@/entities/production-graph/model/location';
import { buildLocationPassportText } from '@/entities/production-graph/model/location-passport';
import type {
  LocationBuilderNodeData,
  LocationPreserveStrength,
  LocationType,
  ProductionNode,
} from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { requestDescribeLocation } from '@/shared/api/ai-client';
import { DEFAULT_ANALYSIS_MODEL } from '@/shared/api/openrouter-models';
import { prepareImageForOpenRouter } from '@/shared/lib/image-data-url';

export function useLocationBuilderNodeModel(node: ProductionNode) {
  const data = node.data as LocationBuilderNodeData;
  const edges = useProductionGraphStore((state) => state.edges);
  const nodes = useProductionGraphStore((state) => state.nodes);
  const assets = useProductionGraphStore((state) => state.assets);
  const locations = useProductionGraphStore((state) => state.locations);
  const applyLocationToNode = useProductionGraphStore((state) => state.applyLocationToNode);
  const deleteEdge = useProductionGraphStore((state) => state.deleteEdge);
  const publishLocationFromNode = useProductionGraphStore((state) => state.publishLocationFromNode);
  const setNodeStatus = useProductionGraphStore((state) => state.setNodeStatus);
  const updateNodeData = useProductionGraphStore((state) => state.updateNodeData);
  const updateNodeDataSilent = useProductionGraphStore((state) => state.updateNodeDataSilent);
  const [describing, setDescribing] = useState(false);
  const textInputs = useMemo(() => (
    getIncomingTextInputs(node.id, 'text', { edges, nodes })
  ), [edges, node.id, nodes]);
  const imageInputs = useMemo(() => (
    getIncomingImageInputs(node.id, 'image', { assets, edges, nodes })
  ), [assets, edges, node.id, nodes]);
  const result = useMemo(() => (
    buildLocationPassportText(data, textInputs.map((input) => ({
      label: input.sourceLabel,
      text: input.text,
    })))
  ), [data, textInputs]);
  const libraryImageAssetIds = data.libraryImageAssetIds ?? [];
  const imageReferenceItems = useMemo(() => {
    const seen = new Set<string>();
    const items: Array<{ assetId: string; edgeId?: string; source: 'input' | 'library' }> = [];
    imageInputs.forEach((input) => {
      if (seen.has(input.assetId)) return;
      seen.add(input.assetId);
      items.push({ assetId: input.assetId, edgeId: input.edge.id, source: 'input' });
    });
    libraryImageAssetIds.forEach((assetId) => {
      if (seen.has(assetId)) return;
      seen.add(assetId);
      items.push({ assetId, source: 'library' });
    });
    return items;
  }, [imageInputs, libraryImageAssetIds]);
  const imageAssetIds = imageReferenceItems.map((item) => item.assetId);
  const imageCount = imageAssetIds.length;
  const sourceCount = textInputs.length + imageCount;
  const locationLibraryOptions = useMemo(() => (
    locations.map((location) => ({ value: location.id, label: location.title }))
  ), [locations]);
  const selectedLibraryLocationId = data.libraryLocationId && locationLibraryOptions.some((option) => option.value === data.libraryLocationId)
    ? data.libraryLocationId
    : locationLibraryOptions[0]?.value ?? '';
  const preserveStrength = normalizeLocationPreserveStrength(data.preserveStrength);
  const locationType = normalizeLocationType(data.locationType);
  const canDescribeLocation = sourceCount > 0 && !describing;

  useEffect(() => {
    if (data.result === result && data.sourceCount === sourceCount) return;
    updateNodeDataSilent(node.id, { result, sourceCount });
  }, [data.result, data.sourceCount, node.id, result, sourceCount, updateNodeDataSilent]);

  const handleDescribeLocation = async () => {
    if (describing) return;
    if (sourceCount === 0) {
      updateNodeData(node.id, { message: 'Подключи image refs или text notes к Location Builder, чтобы сгенерировать описание.' });
      return;
    }

    try {
      setDescribing(true);
      setNodeStatus(node.id, 'running');
      updateNodeDataSilent(node.id, { message: '' });
      const imageDataUrls = await Promise.all(imageAssetIds.slice(0, 4).map(async (assetId) => {
        const asset = assets.find((item) => item.id === assetId);
        if (!asset) throw new Error('Один из image refs не найден в локальном графе.');
        const blob = await loadAssetBlob(asset);
        if (!blob) throw new Error(`Не удалось прочитать image ref "${asset.name}" из локального хранилища.`);
        return prepareImageForOpenRouter(blob);
      }));
      const response = await requestDescribeLocation({
        imageDataUrls,
        locationType,
        model: DEFAULT_ANALYSIS_MODEL,
        textNotes: textInputs.map((input) => input.text),
      });
      const draft = response.draft;
      updateNodeData(node.id, {
        atmosphere: cleanDraftValue(draft.atmosphere, data.atmosphere),
        description: cleanDraftValue(draft.description, data.description),
        locationType: draft.locationType ? normalizeLocationType(draft.locationType) : locationType,
        mutableAttributes: cleanDraftValue(draft.mutableAttributes, data.mutableAttributes),
        name: cleanDraftValue(draft.name, data.name),
        negativeConstraints: cleanDraftValue(draft.negativeConstraints, data.negativeConstraints),
        notes: cleanDraftValue(draft.notes, data.notes),
        spatialLayout: cleanDraftValue(draft.spatialLayout, data.spatialLayout),
        message: response.message ?? 'Location description generated from attached sources.',
      });
      setNodeStatus(node.id, 'success');
    } catch (error) {
      setNodeStatus(node.id, 'error');
      updateNodeDataSilent(node.id, {
        message: error instanceof Error ? error.message : 'OpenRouter location description failed',
      });
    } finally {
      setDescribing(false);
    }
  };

  return {
    canDescribeLocation,
    data,
    describing,
    handleApplyLocationFromLibrary: (locationId: string) => {
      if (!locationId) return;
      const response = applyLocationToNode(node.id, locationId);
      if (!response.ok) updateNodeData(node.id, { message: response.reason });
    },
    handleAtmosphereChange: (atmosphere: string) => updateNodeData(node.id, { atmosphere }),
    handleDescribeLocation,
    handleDescriptionChange: (description: string) => updateNodeData(node.id, { description }),
    handleLocationTypeChange: (locationType: string) => updateNodeData(node.id, { locationType: normalizeLocationType(locationType) }),
    handleMutableAttributesChange: (mutableAttributes: string) => updateNodeData(node.id, { mutableAttributes }),
    handleNameChange: (name: string) => updateNodeData(node.id, { name }),
    handleNegativeConstraintsChange: (negativeConstraints: string) => updateNodeData(node.id, { negativeConstraints }),
    handleNotesChange: (notes: string) => updateNodeData(node.id, { notes }),
    handlePreserveStrengthChange: (preserveStrength: string) => updateNodeData(node.id, { preserveStrength: normalizeLocationPreserveStrength(preserveStrength) }),
    handlePublishLocation: () => {
      const response = publishLocationFromNode(node.id);
      if (!response.ok) updateNodeData(node.id, { message: response.reason });
    },
    handleRemoveImageReference: (assetId: string, edgeId?: string) => {
      if (edgeId) {
        deleteEdge(edgeId);
        return;
      }
      updateNodeData(node.id, {
        libraryImageAssetIds: libraryImageAssetIds.filter((item) => item !== assetId),
      });
    },
    handleSpatialLayoutChange: (spatialLayout: string) => updateNodeData(node.id, { spatialLayout }),
    imageAssetIds,
    imageCount,
    imageInputs,
    imageReferenceItems,
    libraryImageCount: libraryImageAssetIds.length,
    locationLibraryOptions,
    locationType,
    locations,
    preserveStrength,
    result,
    selectedLibraryLocationId,
    sourceCount,
    textCount: textInputs.length,
    textInputs,
  };
}

function cleanDraftValue(value: string | undefined, fallback: string) {
  return value?.trim() || fallback;
}

export const locationTypeOptions: Array<{ value: LocationType; label: string }> = [
  { value: 'interior', label: 'Interior' },
  { value: 'exterior', label: 'Exterior' },
  { value: 'urban', label: 'Urban' },
  { value: 'nature', label: 'Nature' },
  { value: 'studio', label: 'Studio' },
  { value: 'abstract', label: 'Abstract' },
];

export const locationPreserveStrengthOptions: Array<{ value: LocationPreserveStrength; label: string }> = [
  { value: 'strict', label: 'Strict' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'flexible', label: 'Flexible' },
];
