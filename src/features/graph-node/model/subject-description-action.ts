import { loadAssetBlob } from '@/entities/production-graph/lib/asset-db';
import type { GraphTextInputItem } from '@/entities/production-graph/model/graph-io';
import { normalizeSubjectType } from '@/entities/production-graph/model/subject';
import type { AssetRecord, SubjectBuilderNodeData, SubjectType } from '@/entities/production-graph/model/types';
import { DEFAULT_ANALYSIS_MODEL } from '@/shared/api/openrouter-models';
import { prepareImageForOpenRouter } from '@/shared/lib/image-data-url';
import { requestDescribeSubject } from '../api/ai-client';
import type { SubjectBuilderStoreActions } from './subject-builder-action-contracts';
import { cleanDraftValue } from './subject-reference-values';

interface Params extends Pick<SubjectBuilderStoreActions, 'setNodeStatus' | 'updateNodeData' | 'updateNodeDataSilent'> {
  assets: AssetRecord[];
  data: SubjectBuilderNodeData;
  imageAssetIds: string[];
  nodeId: string;
  setDescribing: (value: boolean) => void;
  sourceCount: number;
  subjectType: SubjectType;
  textInputs: GraphTextInputItem[];
}

export function createSubjectDescriptionAction(params: Params) {
  return async () => {
    if (params.sourceCount === 0) {
      params.updateNodeData(params.nodeId, {
        message: 'Подключи image refs или text notes к Subject Builder, чтобы сгенерировать описание.',
      });
      return;
    }
    try {
      params.setDescribing(true);
      params.setNodeStatus(params.nodeId, 'running');
      params.updateNodeDataSilent(params.nodeId, { message: '' });
      const imageDataUrls = await Promise.all(params.imageAssetIds.slice(0, 4).map(async (assetId) => {
        const asset = params.assets.find((item) => item.id === assetId);
        if (!asset) throw new Error('Один из image refs не найден в локальном графе.');
        const blob = await loadAssetBlob(asset);
        if (!blob) throw new Error(`Не удалось прочитать image ref "${asset.name}" из локального хранилища.`);
        return prepareImageForOpenRouter(blob);
      }));
      const response = await requestDescribeSubject({
        imageDataUrls,
        model: DEFAULT_ANALYSIS_MODEL,
        subjectType: params.subjectType,
        textNotes: params.textInputs.map((input) => input.text),
      });
      const draft = response.draft;
      params.updateNodeData(params.nodeId, {
        identitySummary: cleanDraftValue(draft.identitySummary, params.data.identitySummary),
        immutableTraits: cleanDraftValue(draft.immutableTraits, params.data.immutableTraits),
        mutableAttributes: cleanDraftValue(draft.mutableAttributes, params.data.mutableAttributes),
        name: cleanDraftValue(draft.name, params.data.name),
        negativeConstraints: cleanDraftValue(draft.negativeConstraints, params.data.negativeConstraints),
        notes: cleanDraftValue(draft.notes, params.data.notes),
        subjectType: draft.subjectType ? normalizeSubjectType(draft.subjectType) : params.subjectType,
        message: response.message ?? 'Subject description generated from attached sources.',
      });
      params.setNodeStatus(params.nodeId, 'success');
    } catch (error) {
      params.setNodeStatus(params.nodeId, 'error');
      params.updateNodeDataSilent(params.nodeId, {
        message: error instanceof Error ? error.message : 'OpenRouter subject description failed',
      });
    } finally {
      params.setDescribing(false);
    }
  };
}
