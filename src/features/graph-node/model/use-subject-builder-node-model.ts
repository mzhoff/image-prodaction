'use client';

import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { getIncomingImageInputs, getIncomingTextInputs } from '@/entities/production-graph/model/graph-io';
import { buildSubjectPassportText } from '@/entities/production-graph/model/subject-passport';
import { normalizeSubjectPreserveStrength, normalizeSubjectType } from '@/entities/production-graph/model/subject';
import type { ProductionNode, SubjectBuilderNodeData } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { DEFAULT_IMAGE_MODEL } from '@/shared/api/openrouter-models';
import { useOpenRouterModels } from '@/shared/api/use-openrouter-models';
import { getSelectedModelId, modelSelectOptions } from '../lib/node-select-options';
import { createSubjectDescriptionAction } from './subject-description-action';
import { createSubjectMaskEditAction } from './subject-mask-edit-action';
import { createSubjectReferenceGenerationAction } from './subject-reference-generation-action';
import {
  SUBJECT_PROFILE_REFERENCE_SLOTS,
  uniqueStrings,
} from './subject-reference-values';
import { useSubjectReferenceRecovery } from './use-subject-reference-recovery';

export { subjectPreserveStrengthOptions, subjectTypeOptions } from './subject-reference-values';

export function useSubjectBuilderNodeModel(node: ProductionNode) {
  const data = node.data as SubjectBuilderNodeData;
  const edges = useProductionGraphStore((state) => state.edges);
  const nodes = useProductionGraphStore((state) => state.nodes);
  const assets = useProductionGraphStore((state) => state.assets);
  const subjects = useProductionGraphStore((state) => state.subjects);
  const addAsset = useProductionGraphStore((state) => state.addAsset);
  const applySubjectToNode = useProductionGraphStore((state) => state.applySubjectToNode);
  const deleteEdge = useProductionGraphStore((state) => state.deleteEdge);
  const publishSubjectFromNode = useProductionGraphStore((state) => state.publishSubjectFromNode);
  const setNodeStatus = useProductionGraphStore((state) => state.setNodeStatus);
  const updateNodeData = useProductionGraphStore((state) => state.updateNodeData);
  const updateNodeDataSilent = useProductionGraphStore((state) => state.updateNodeDataSilent);
  const { imageModels } = useOpenRouterModels();
  const [describing, setDescribing] = useState(false);
  const [generatingReferenceTarget, setGeneratingReferenceTarget] = useState<string | null>(null);
  const textInputs = useMemo(
    () => getIncomingTextInputs(node.id, 'text', { edges, nodes }),
    [edges, node.id, nodes],
  );
  const imageInputs = useMemo(
    () => getIncomingImageInputs(node.id, 'image', { assets, edges, nodes }),
    [assets, edges, node.id, nodes],
  );
  const result = useMemo(() => buildSubjectPassportText(data, textInputs.map((input) => ({
    label: input.sourceLabel,
    text: input.text,
  }))), [data, textInputs]);
  const libraryImageAssetIds = useMemo(
    () => uniqueStrings(data.libraryImageAssetIds ?? []),
    [data.libraryImageAssetIds],
  );
  const generatedImageAssetIds = useMemo(
    () => libraryImageAssetIds.slice(0, SUBJECT_PROFILE_REFERENCE_SLOTS.length),
    [libraryImageAssetIds],
  );
  const imageReferenceItems = useMemo(() => buildImageReferenceItems(imageInputs, libraryImageAssetIds),
    [imageInputs, libraryImageAssetIds]);
  const imageAssetIds = useMemo(() => imageReferenceItems.map((item) => item.assetId), [imageReferenceItems]);
  const generatedReferenceSlots = useMemo(() => SUBJECT_PROFILE_REFERENCE_SLOTS.map((slot, index) => ({
    assetId: generatedImageAssetIds[index],
    id: slot.id,
    label: slot.label,
  })), [generatedImageAssetIds]);
  const imageCount = imageAssetIds.length;
  const sourceCount = textInputs.length + imageCount;
  const subjectLibraryOptions = useMemo(
    () => subjects.map((subject) => ({ value: subject.id, label: subject.title })),
    [subjects],
  );
  const selectedLibrarySubjectId = data.librarySubjectId
    && subjectLibraryOptions.some((option) => option.value === data.librarySubjectId)
    ? data.librarySubjectId
    : subjectLibraryOptions[0]?.value ?? '';
  const preserveStrength = normalizeSubjectPreserveStrength(data.preserveStrength);
  const subjectType = normalizeSubjectType(data.subjectType);
  const selectedReferenceModel = getSelectedModelId(imageModels, data.referenceModel, DEFAULT_IMAGE_MODEL);
  const referenceModelOptions = useMemo(() => modelSelectOptions(imageModels), [imageModels]);
  const generatingReferences = generatingReferenceTarget !== null;
  const storeActions = { addAsset, setNodeStatus, updateNodeData, updateNodeDataSilent };

  const { controllerRef, pendingReferenceJobId } = useSubjectReferenceRecovery({
    generatingReferenceTarget,
    setGeneratingReferenceTarget,
    ...storeActions,
    data,
    generatedImageAssetIds,
    imageCount,
    nodeId: node.id,
    textInputCount: textInputs.length,
  });
  const flowControl = { controllerRef, generatingReferenceTarget, setGeneratingReferenceTarget };

  useEffect(() => {
    if (data.result !== result || data.sourceCount !== sourceCount) {
      updateNodeDataSilent(node.id, { result, sourceCount });
    }
  }, [data.result, data.sourceCount, node.id, result, sourceCount, updateNodeDataSilent]);

  const handleDescribeSubject = createSubjectDescriptionAction({
    ...storeActions,
    assets,
    data,
    imageAssetIds,
    nodeId: node.id,
    setDescribing,
    sourceCount,
    subjectType,
    textInputs,
  });
  const handleGenerateSubjectReferences = createSubjectReferenceGenerationAction({
    ...flowControl,
    ...storeActions,
    assets,
    data,
    generatedImageAssetIds,
    imageAssetIds,
    imageCount,
    nodeId: node.id,
    result,
    selectedReferenceModel,
    subjectType,
    textInputs,
  });
  const handleMaskEdit = createSubjectMaskEditAction({
    ...storeActions,
    assets,
    data,
    generatedImageAssetIds,
    imageCount,
    nodeId: node.id,
    textInputCount: textInputs.length,
  });
  const generatePendingReferences = useEffectEvent(() => void handleGenerateSubjectReferences());

  useEffect(() => {
    const shouldResume = data.referenceGenerationBatchPending
      && !generatingReferences
      && !pendingReferenceJobId
      && generatedImageAssetIds.length < SUBJECT_PROFILE_REFERENCE_SLOTS.length
      && imageAssetIds.length > 0;
    if (shouldResume) generatePendingReferences();
  }, [data.referenceGenerationBatchPending, generatedImageAssetIds.length, generatingReferences, imageAssetIds.length, pendingReferenceJobId]);

  return {
    canDescribeSubject: sourceCount > 0 && !describing,
    canGenerateSubjectReferences: imageAssetIds.length > 0 && !generatingReferences,
    data,
    describing,
    generatedReferenceSlots,
    generatingReferenceSlotId: generatingReferenceTarget && generatingReferenceTarget !== 'all'
      ? generatingReferenceTarget
      : '',
    generatingReferences,
    handleApplySubjectFromLibrary: (subjectId: string) => {
      if (!subjectId) return;
      const response = applySubjectToNode(node.id, subjectId);
      if (!response.ok) updateNodeData(node.id, { message: response.reason });
    },
    handleDescribeSubject: describing ? async () => undefined : handleDescribeSubject,
    handleGenerateSubjectReferences,
    handleIdentitySummaryChange: (identitySummary: string) => updateNodeData(node.id, { identitySummary }),
    handleImmutableTraitsChange: (immutableTraits: string) => updateNodeData(node.id, { immutableTraits }),
    handleMaskEdit,
    handleMutableAttributesChange: (mutableAttributes: string) => updateNodeData(node.id, { mutableAttributes }),
    handleNameChange: (name: string) => updateNodeData(node.id, { name }),
    handleNegativeConstraintsChange: (negativeConstraints: string) => updateNodeData(node.id, { negativeConstraints }),
    handleNotesChange: (notes: string) => updateNodeData(node.id, { notes }),
    handlePreserveStrengthChange: (value: string) => updateNodeData(node.id, {
      preserveStrength: normalizeSubjectPreserveStrength(value),
    }),
    handlePublishSubject: () => {
      const response = publishSubjectFromNode(node.id);
      if (!response.ok) updateNodeData(node.id, { message: response.reason });
    },
    handleReferenceModelChange: (referenceModel: string) => updateNodeData(node.id, { referenceModel }),
    handleRemoveImageReference: (assetId: string, edgeId?: string) => edgeId
      ? deleteEdge(edgeId)
      : updateNodeData(node.id, { libraryImageAssetIds: libraryImageAssetIds.filter((id) => id !== assetId) }),
    handleSubjectTypeChange: (value: string) => updateNodeData(node.id, { subjectType: normalizeSubjectType(value) }),
    hasGeneratedReferences: generatedImageAssetIds.length > 0,
    imageAssetIds,
    imageCount,
    imageReferenceItems,
    preserveStrength,
    referenceModelOptions,
    result,
    selectedLibrarySubjectId,
    selectedReferenceModel,
    subjectLibraryOptions,
    subjectType,
    textCount: textInputs.length,
    textInputs,
  };
}

function buildImageReferenceItems(
  imageInputs: ReturnType<typeof getIncomingImageInputs>,
  libraryImageAssetIds: string[],
) {
  const seen = new Set<string>();
  const items: Array<{ assetId: string; edgeId?: string; source: 'input' | 'library' }> = [];
  for (const input of imageInputs) {
    if (seen.has(input.assetId)) continue;
    seen.add(input.assetId);
    items.push({ assetId: input.assetId, edgeId: input.edge.id, source: 'input' });
  }
  for (const assetId of libraryImageAssetIds) {
    if (seen.has(assetId)) continue;
    seen.add(assetId);
    items.push({ assetId, source: 'library' });
  }
  return items;
}
