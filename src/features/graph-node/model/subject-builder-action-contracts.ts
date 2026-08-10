import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { GraphTextInputItem } from '@/entities/production-graph/model/graph-io';
import type { ProductionGraphState } from '@/entities/production-graph/model/store-types';
import type { AssetRecord, SubjectBuilderNodeData, SubjectType } from '@/entities/production-graph/model/types';

export type SubjectBuilderStoreActions = Pick<
  ProductionGraphState,
  'addAsset' | 'setNodeStatus' | 'updateNodeData' | 'updateNodeDataSilent'
>;

export interface SubjectReferenceFlowControl {
  controllerRef: RefObject<AbortController | null>;
  generatingReferenceTarget: string | null;
  setGeneratingReferenceTarget: Dispatch<SetStateAction<string | null>>;
}

export interface SubjectReferenceGenerationContext extends SubjectBuilderStoreActions, SubjectReferenceFlowControl {
  assets: AssetRecord[];
  data: SubjectBuilderNodeData;
  generatedImageAssetIds: string[];
  imageAssetIds: string[];
  imageCount: number;
  nodeId: string;
  result: string;
  selectedReferenceModel: string;
  subjectType: SubjectType;
  textInputs: GraphTextInputItem[];
}
