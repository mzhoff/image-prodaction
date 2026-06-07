'use client';

import { useEffect, useMemo, useState } from 'react';
import { loadAssetBlob, saveImageAsset } from '@/entities/production-graph/lib/asset-db';
import { getIncomingImageInputs, getIncomingTextInputs } from '@/entities/production-graph/model/graph-io';
import { productionLayers } from '@/entities/production-graph/model/production-layers';
import { buildSubjectPassportText } from '@/entities/production-graph/model/subject-passport';
import { normalizeSubjectPreserveStrength, normalizeSubjectType } from '@/entities/production-graph/model/subject';
import type {
  ProductionNode,
  SubjectBuilderNodeData,
  SubjectPreserveStrength,
  SubjectType,
} from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { requestDescribeSubject, requestEditImage, requestGenerateImage } from '@/shared/api/ai-client';
import { DEFAULT_ANALYSIS_MODEL, DEFAULT_IMAGE_MODEL } from '@/shared/api/openrouter-models';
import { useOpenRouterModels } from '@/shared/api/use-openrouter-models';
import { blobToDataUrl, dataUrlToFile, prepareImageForOpenRouter } from '@/shared/lib/image-data-url';
import { getSelectedModelId, modelSelectOptions } from '../lib/node-select-options';

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
  const generatingReferences = generatingReferenceTarget !== null;
  const generatingReferenceSlotId = generatingReferenceTarget && generatingReferenceTarget !== 'all'
    ? generatingReferenceTarget
    : '';
  const textInputs = useMemo(() => (
    getIncomingTextInputs(node.id, 'text', { edges, nodes })
  ), [edges, node.id, nodes]);
  const imageInputs = useMemo(() => (
    getIncomingImageInputs(node.id, 'image', { assets, edges, nodes })
  ), [assets, edges, node.id, nodes]);
  const result = useMemo(() => (
    buildSubjectPassportText(data, textInputs.map((input) => ({
      label: input.sourceLabel,
      text: input.text,
    })))
  ), [data, textInputs]);
  const libraryImageAssetIds = useMemo(() => uniqueStrings(data.libraryImageAssetIds ?? []), [data.libraryImageAssetIds]);
  const generatedImageAssetIds = useMemo(() => libraryImageAssetIds.slice(0, SUBJECT_PROFILE_REFERENCE_SLOTS.length), [libraryImageAssetIds]);
  const hasGeneratedReferences = generatedImageAssetIds.length > 0;
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
  const imageAssetIds = useMemo(() => imageReferenceItems.map((item) => item.assetId), [imageReferenceItems]);
  const generatedReferenceSlots = useMemo(() => (
    SUBJECT_PROFILE_REFERENCE_SLOTS.map((slot, index) => ({
      assetId: generatedImageAssetIds[index],
      id: slot.id,
      label: slot.label,
    }))
  ), [generatedImageAssetIds]);
  const imageCount = imageAssetIds.length;
  const sourceCount = textInputs.length + imageCount;
  const subjectLibraryOptions = useMemo(() => (
    subjects.map((subject) => ({ value: subject.id, label: subject.title }))
  ), [subjects]);
  const selectedLibrarySubjectId = data.librarySubjectId && subjectLibraryOptions.some((option) => option.value === data.librarySubjectId)
    ? data.librarySubjectId
    : subjectLibraryOptions[0]?.value ?? '';
  const preserveStrength = normalizeSubjectPreserveStrength(data.preserveStrength);
  const subjectType = normalizeSubjectType(data.subjectType);
  const selectedReferenceModel = getSelectedModelId(imageModels, data.referenceModel, DEFAULT_IMAGE_MODEL);
  const referenceModelOptions = useMemo(() => modelSelectOptions(imageModels), [imageModels]);
  const canDescribeSubject = sourceCount > 0 && !describing;
  const canGenerateSubjectReferences = imageAssetIds.length > 0 && !generatingReferences;

  useEffect(() => {
    if (data.result === result && data.sourceCount === sourceCount) return;
    updateNodeDataSilent(node.id, { result, sourceCount });
  }, [data.result, data.sourceCount, node.id, result, sourceCount, updateNodeDataSilent]);

  const handleDescribeSubject = async () => {
    if (describing) return;
    if (sourceCount === 0) {
      updateNodeData(node.id, { message: 'Подключи image refs или text notes к Subject Builder, чтобы сгенерировать описание.' });
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
      const response = await requestDescribeSubject({
        imageDataUrls,
        model: DEFAULT_ANALYSIS_MODEL,
        subjectType,
        textNotes: textInputs.map((input) => input.text),
      });
      const draft = response.draft;
      updateNodeData(node.id, {
        identitySummary: cleanDraftValue(draft.identitySummary, data.identitySummary),
        immutableTraits: cleanDraftValue(draft.immutableTraits, data.immutableTraits),
        mutableAttributes: cleanDraftValue(draft.mutableAttributes, data.mutableAttributes),
        name: cleanDraftValue(draft.name, data.name),
        negativeConstraints: cleanDraftValue(draft.negativeConstraints, data.negativeConstraints),
        notes: cleanDraftValue(draft.notes, data.notes),
        subjectType: draft.subjectType ? normalizeSubjectType(draft.subjectType) : subjectType,
        message: response.message ?? 'Subject description generated from attached sources.',
      });
      setNodeStatus(node.id, 'success');
    } catch (error) {
      setNodeStatus(node.id, 'error');
      updateNodeDataSilent(node.id, {
        message: error instanceof Error ? error.message : 'OpenRouter subject description failed',
      });
    } finally {
      setDescribing(false);
    }
  };

  const handleGenerateSubjectReferences = async (slotId?: string) => {
    if (generatingReferences) return;
    if (imageAssetIds.length === 0) {
      updateNodeData(node.id, { message: 'Подключи image refs к Subject Builder, чтобы сгенерировать canonical references.' });
      return;
    }
    const targetSlot = slotId ? SUBJECT_PROFILE_REFERENCE_SLOTS.find((slot) => slot.id === slotId) : undefined;
    if (slotId && !targetSlot) return;
    const slotsToGenerate = targetSlot ? [targetSlot] : SUBJECT_PROFILE_REFERENCE_SLOTS;
    const nextGeneratedAssetIds = targetSlot ? [...generatedImageAssetIds] : [];

    try {
      setGeneratingReferenceTarget(targetSlot?.id ?? 'all');
      setNodeStatus(node.id, 'running');
      updateNodeDataSilent(node.id, {
        message: targetSlot
          ? `Regenerating ${targetSlot.label.toLowerCase()} reference...`
          : 'Generating canonical subject references...',
      });
      const sourceImages = await Promise.all(imageAssetIds.slice(0, 4).map(async (assetId) => {
        const asset = assets.find((item) => item.id === assetId);
        if (!asset) throw new Error('Один из image refs не найден в локальном графе.');
        const blob = await loadAssetBlob(asset);
        if (!blob) throw new Error(`Не удалось прочитать image ref "${asset.name}" из локального хранилища.`);
        return prepareImageForOpenRouter(blob);
      }));
      const subjectPassport = result.trim();

      for (const slot of slotsToGenerate) {
        updateNodeDataSilent(node.id, { message: `Generating ${slot.label.toLowerCase()} reference...` });
        const response = await requestGenerateImage({
          aspectRatio: '1:1',
          inputs: createEmptyGenerateInputs(),
          model: selectedReferenceModel,
          prompt: buildSubjectReferencePrompt({
            slotId: slot.id,
            slotLabel: slot.label,
            subjectPassport,
            subjectType,
            textNotes: textInputs.map((input) => input.text),
          }),
          referenceImages: sourceImages.map((dataUrl) => ({
            dataUrl,
            slots: ['actors'],
            sourceNodeTypes: ['subjectBuilder'],
          })),
          size: '1K',
          subjectInputs: subjectPassport ? [subjectPassport] : [],
        });
        const file = await dataUrlToFile(response.imageDataUrl, `subject-${slot.id}-${Date.now()}.png`);
        const asset = await saveImageAsset(file);
        addAsset(asset);
        if (targetSlot) {
          const slotIndex = SUBJECT_PROFILE_REFERENCE_SLOTS.findIndex((item) => item.id === slot.id);
          nextGeneratedAssetIds[slotIndex] = asset.id;
        } else {
          nextGeneratedAssetIds.push(asset.id);
        }
      }
      const libraryImageAssetIds = SUBJECT_PROFILE_REFERENCE_SLOTS
        .map((_, index) => nextGeneratedAssetIds[index])
        .filter((assetId): assetId is string => Boolean(assetId));

      updateNodeData(node.id, {
        libraryImageAssetIds,
        message: targetSlot
          ? `Regenerated ${targetSlot.label} canonical subject reference.`
          : 'Generated 4 canonical subject references.',
        referenceModel: selectedReferenceModel,
        sourceCount: textInputs.length + imageCount + libraryImageAssetIds.length,
      });
      setNodeStatus(node.id, 'success');
    } catch (error) {
      setNodeStatus(node.id, 'error');
      updateNodeDataSilent(node.id, {
        message: error instanceof Error ? error.message : 'OpenRouter canonical subject reference generation failed',
      });
    } finally {
      setGeneratingReferenceTarget(null);
    }
  };

  const handleMaskEdit = async (
    slotId: string,
    { assetId, maskDataUrl, model, prompt }: { assetId: string; maskDataUrl: string; model: string; prompt: string },
  ) => {
    try {
      setNodeStatus(node.id, 'running');
      updateNodeDataSilent(node.id, { message: `Editing ${getSubjectReferenceSlotLabel(slotId).toLowerCase()} reference...` });
      const sourceAsset = assets.find((asset) => asset.id === assetId);
      if (!sourceAsset) throw new Error('Активное изображение не найдено в локальном графе.');
      const sourceBlob = await loadAssetBlob(sourceAsset);
      if (!sourceBlob) throw new Error('Не удалось прочитать активное изображение из локального хранилища.');

      const result = await requestEditImage({
        aspectRatio: '1:1',
        imageDataUrl: await blobToDataUrl(sourceBlob),
        maskDataUrl,
        model,
        prompt,
        size: '1K',
      });
      const file = await dataUrlToFile(result.imageDataUrl, `subject-${slotId}-edited-${Date.now()}.png`);
      const editedAsset = await saveImageAsset(file);
      addAsset(editedAsset);

      const slotIndex = SUBJECT_PROFILE_REFERENCE_SLOTS.findIndex((slot) => slot.id === slotId);
      const nextAssetIds = [...generatedImageAssetIds];
      if (slotIndex >= 0) nextAssetIds[slotIndex] = editedAsset.id;
      const libraryImageAssetIds = SUBJECT_PROFILE_REFERENCE_SLOTS
        .map((_, index) => nextAssetIds[index])
        .filter((nextAssetId): nextAssetId is string => Boolean(nextAssetId));

      updateNodeData(node.id, {
        libraryImageAssetIds,
        message: result.message || `Edited ${getSubjectReferenceSlotLabel(slotId)} subject reference.`,
        referenceModel: model,
        sourceCount: textInputs.length + imageCount + libraryImageAssetIds.length,
      });
      setNodeStatus(node.id, 'success');
    } catch (error) {
      setNodeStatus(node.id, 'error');
      throw error;
    }
  };

  return {
    canDescribeSubject,
    canGenerateSubjectReferences,
    data,
    describing,
    generatedReferenceSlots,
    generatingReferenceSlotId,
    generatingReferences,
    handleApplySubjectFromLibrary: (subjectId: string) => {
      if (!subjectId) return;
      const response = applySubjectToNode(node.id, subjectId);
      if (!response.ok) updateNodeData(node.id, { message: response.reason });
    },
    handleDescribeSubject,
    handleGenerateSubjectReferences,
    handleMaskEdit,
    hasGeneratedReferences,
    handleIdentitySummaryChange: (identitySummary: string) => updateNodeData(node.id, { identitySummary }),
    handleImmutableTraitsChange: (immutableTraits: string) => updateNodeData(node.id, { immutableTraits }),
    handleMutableAttributesChange: (mutableAttributes: string) => updateNodeData(node.id, { mutableAttributes }),
    handleNameChange: (name: string) => updateNodeData(node.id, { name }),
    handleNegativeConstraintsChange: (negativeConstraints: string) => updateNodeData(node.id, { negativeConstraints }),
    handleNotesChange: (notes: string) => updateNodeData(node.id, { notes }),
    handlePreserveStrengthChange: (preserveStrength: string) => updateNodeData(node.id, { preserveStrength: normalizeSubjectPreserveStrength(preserveStrength) }),
    handlePublishSubject: () => {
      const response = publishSubjectFromNode(node.id);
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
    handleSubjectTypeChange: (subjectType: string) => updateNodeData(node.id, { subjectType: normalizeSubjectType(subjectType) }),
    handleReferenceModelChange: (referenceModel: string) => updateNodeData(node.id, { referenceModel }),
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

function cleanDraftValue(value: string | undefined, fallback: string) {
  return value?.trim() || fallback;
}

export const subjectTypeOptions: Array<{ value: SubjectType; label: string }> = [
  { value: 'person', label: 'Person' },
  { value: 'character', label: 'Character' },
  { value: 'product', label: 'Product' },
  { value: 'object', label: 'Object' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'animal', label: 'Animal' },
  { value: 'place', label: 'Place' },
];

export const subjectPreserveStrengthOptions: Array<{ value: SubjectPreserveStrength; label: string }> = [
  { value: 'strict', label: 'Strict' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'flexible', label: 'Flexible' },
];

const SUBJECT_PROFILE_REFERENCE_SLOTS: Array<{ id: string; label: string }> = [
  { id: 'front', label: 'Front' },
  { id: 'three-quarter', label: '3/4' },
  { id: 'profile', label: 'Profile' },
  { id: 'full-body', label: 'Full body' },
];

function getSubjectReferenceSlotLabel(slotId: string) {
  return SUBJECT_PROFILE_REFERENCE_SLOTS.find((slot) => slot.id === slotId)?.label ?? 'Subject';
}

function createEmptyGenerateInputs() {
  return productionLayers.reduce((accumulator, layer) => {
    accumulator[layer.id] = [];
    return accumulator;
  }, {} as Record<string, string[]>);
}

function buildSubjectReferencePrompt({
  slotId,
  slotLabel,
  subjectPassport,
  subjectType,
  textNotes,
}: {
  slotId: string;
  slotLabel: string;
  subjectPassport: string;
  subjectType: SubjectType;
  textNotes: string[];
}) {
  return [
    `Generate canonical library reference image: ${slotLabel}.`,
    getSubjectTypeProfileInstruction(subjectType),
    getSlotPoseInstruction(subjectType, slotId),
    subjectPassport ? `[SUBJECT PASSPORT]\n${subjectPassport}` : '',
    textNotes.length ? `[CONNECTED TEXT NOTES]\n${textNotes.join('\n\n')}` : '',
    'Use the attached image refs only to preserve stable identity, proportions, permanent design traits, body/silhouette, material identity, and recognizable markers.',
    'Neutral light gray studio background, soft even light, clean production reference look, single centered subject, no text, no logo, no watermark, no collage, no dramatic scene context.',
  ].filter(Boolean).join('\n\n');
}

function getSubjectTypeProfileInstruction(subjectType: SubjectType) {
  if (subjectType === 'person' || subjectType === 'character') {
    return [
      'Subject type: human/person or character.',
      'Create a clean casting/profile reference, not a fashion editorial scene.',
      'Wardrobe must be neutral, non-branded, non-distracting, modest, form-readable and safe: simple fitted base layer or plain fitted top and simple pants.',
      'Do not generate nudity, underwear-only styling, sexualized pose, costume noise, heavy accessories, branding, logos, dramatic makeup, or temporary outfit details from source refs unless they are permanent identity markers.',
      'Preserve face identity, head shape, hair, stable facial proportions, body build, posture tendencies, and permanent distinctive marks.',
      'For portrait slots, prioritize likeness and facial detail over clothing or scene; the head and face must be large enough to inspect.',
    ].join(' ');
  }

  if (subjectType === 'product' || subjectType === 'object') {
    return [
      'Subject type: product/object.',
      'Create a clean object library reference on a neutral studio surface or invisible support.',
      'Preserve exact form language, proportions, material, surface finish, functional details, edges, seams, design marks, and scale cues.',
      'Do not add packaging, branding, UI text, hands, environment, extra props, or lifestyle context unless they are permanent parts of the object.',
    ].join(' ');
  }

  if (subjectType === 'vehicle') {
    return [
      'Subject type: vehicle/technical object.',
      'Create a clean catalog reference of one vehicle or machine on a neutral light gray studio background.',
      'Preserve body shape, wheelbase, silhouette, panel geometry, material finish, lights, windows, scale, and permanent technical details.',
      'Do not add road scenes, drivers, motion blur, cinematic lighting, license text, branding, or environment.',
    ].join(' ');
  }

  if (subjectType === 'animal') {
    return [
      'Subject type: animal.',
      'Create a clean biological profile reference on a neutral studio background.',
      'Preserve species, body proportions, coat/skin texture, markings, head shape, posture, and recognizable anatomy.',
      'Do not add costumes, props, humans, habitat, fantasy features, or action scene context.',
    ].join(' ');
  }

  return [
    'Subject type: place/environment-like subject.',
    'Create a clean reusable identity reference with neutral presentation.',
    'Preserve stable form, spatial cues, material identity, geometry, and recognizable permanent details.',
    'Do not add narrative action, people, branding, random text, or unrelated props.',
  ].join(' ');
}

function getSlotPoseInstruction(subjectType: SubjectType, slotId: string) {
  if (subjectType === 'person' || subjectType === 'character') {
    if (slotId === 'front') return 'View: front-facing close neck-and-shoulders portrait, symmetrical readable face/head, upper shoulders only, face large in frame for maximum likeness detail.';
    if (slotId === 'three-quarter') return 'View: three-quarter close shoulder portrait, readable face/head volume and facial structure, upper torso cropped, face large in frame.';
    if (slotId === 'profile') return 'View: strict side profile close neck-and-shoulders portrait, clean readable side silhouette, face/head large in frame for maximum identity detail.';
    return 'View: full-body standing reference, complete figure visible head-to-toe with readable body proportions and neutral stance.';
  }

  if (subjectType === 'animal') {
    if (slotId === 'front') return 'View: front-facing close head-and-shoulders biological reference, head large in frame with readable markings.';
    if (slotId === 'three-quarter') return 'View: three-quarter close biological profile reference, readable head volume, markings, and anatomy.';
    if (slotId === 'profile') return 'View: strict side profile close biological reference, clean readable side silhouette and markings.';
    return 'View: full-body standing biological reference, complete animal visible head-to-tail with readable body proportions and neutral stance.';
  }

  if (subjectType === 'vehicle') {
    if (slotId === 'front') return 'View: front view, centered, full vehicle visible.';
    if (slotId === 'three-quarter') return 'View: three-quarter front view, full vehicle visible.';
    if (slotId === 'profile') return 'View: strict side profile, full vehicle silhouette visible.';
    return 'View: full catalog view with complete vehicle/machine visible and scale readable.';
  }

  if (slotId === 'front') return 'View: front orthographic-like product reference.';
  if (slotId === 'three-quarter') return 'View: three-quarter product reference showing volume and depth.';
  if (slotId === 'profile') return 'View: side profile reference showing silhouette and thickness.';
  return 'View: full object reference with complete form visible and scale readable.';
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}
