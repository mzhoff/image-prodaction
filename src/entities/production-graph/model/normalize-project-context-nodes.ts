import { normalizeNodeSize } from './node-layout';
import { normalizeLocationPreserveStrength, normalizeLocationType } from './location';
import { normalizeStringArray } from './normalize-project-values';
import { normalizeSubjectPreserveStrength, normalizeSubjectType } from './subject';
import type { ProductionNode, ProductionNodeData } from './types';

export function normalizeContextNode(node: ProductionNode): ProductionNode | null {
  if (node.type === 'iterator') {
    const data = node.data as ProductionNodeData & {
      activeIndex?: unknown;
      activeKind?: unknown;
      disabledResultFilterIds?: unknown;
      imageCount?: unknown;
      textCount?: unknown;
    };
    return {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
      data: {
        ...data,
        activeImageAssetId: '',
        activeIndex: typeof data.activeIndex === 'number' && Number.isFinite(data.activeIndex) ? Math.max(0, Math.floor(data.activeIndex)) : 0,
        activeKind: data.activeKind === 'text' ? 'text' : 'image',
        activeText: '',
        disabledResultFilterIds: normalizeStringArray(data.disabledResultFilterIds),
        imageCount: typeof data.imageCount === 'number' && Number.isFinite(data.imageCount) ? Math.max(0, Math.floor(data.imageCount)) : 0,
        message: '',
        textCount: typeof data.textCount === 'number' && Number.isFinite(data.textCount) ? Math.max(0, Math.floor(data.textCount)) : 0,
        title: 'Iterator',
      },
    } as ProductionNode;
  }

  if (node.type === 'subjectBuilder') {
    const data = node.data as ProductionNodeData & {
      libraryImageAssetIds?: unknown;
      librarySubjectId?: unknown;
      libraryUpdatedAt?: unknown;
      preserveStrength?: unknown;
      referenceModel?: unknown;
      subjectType?: unknown;
    };
    return {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
      data: {
        name: '',
        identitySummary: '',
        immutableTraits: '',
        mutableAttributes: '',
        negativeConstraints: '',
        notes: '',
        result: '',
        sourceCount: 0,
        ...data,
        libraryImageAssetIds: normalizeStringArray(data.libraryImageAssetIds),
        librarySubjectId: typeof data.librarySubjectId === 'string' ? data.librarySubjectId : undefined,
        libraryUpdatedAt: typeof data.libraryUpdatedAt === 'string' ? data.libraryUpdatedAt : undefined,
        preserveStrength: normalizeSubjectPreserveStrength(data.preserveStrength),
        referenceModel: typeof data.referenceModel === 'string' ? data.referenceModel : 'google/gemini-2.5-flash-image',
        subjectType: normalizeSubjectType(data.subjectType),
        title: 'Subject',
      },
    } as ProductionNode;
  }

  if (node.type === 'locationBuilder') {
    const data = node.data as ProductionNodeData & {
      libraryImageAssetIds?: unknown;
      libraryLocationId?: unknown;
      libraryUpdatedAt?: unknown;
      locationType?: unknown;
      preserveStrength?: unknown;
    };
    return {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
      data: {
        atmosphere: '',
        description: '',
        mutableAttributes: '',
        name: '',
        negativeConstraints: '',
        notes: '',
        result: '',
        sourceCount: 0,
        spatialLayout: '',
        ...data,
        libraryImageAssetIds: normalizeStringArray(data.libraryImageAssetIds),
        libraryLocationId: typeof data.libraryLocationId === 'string' ? data.libraryLocationId : undefined,
        libraryUpdatedAt: typeof data.libraryUpdatedAt === 'string' ? data.libraryUpdatedAt : undefined,
        locationType: normalizeLocationType(data.locationType),
        preserveStrength: normalizeLocationPreserveStrength(data.preserveStrength),
        title: 'Location',
      },
    } as ProductionNode;
  }

  return null;
}
