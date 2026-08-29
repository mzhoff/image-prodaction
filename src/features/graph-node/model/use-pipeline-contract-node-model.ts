'use client';

import { useCallback, useState } from 'react';
import type {
  PipelineContractField,
  PipelineInputNodeData,
  PipelineOutputNodeData,
  ProductionNode,
  StructuredOutputNodeData,
} from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';

type PipelineContractNodeData =
  | PipelineInputNodeData
  | PipelineOutputNodeData
  | StructuredOutputNodeData;

export function usePipelineContractNodeModel(node: ProductionNode) {
  const data = node.data as PipelineContractNodeData;
  const updatePipelineContractFields = useProductionGraphStore((state) => state.updatePipelineContractFields);
  const updateNodeData = useProductionGraphStore((state) => state.updateNodeData);
  const [message, setMessage] = useState('');

  const handleFieldsChange = useCallback((fields: PipelineContractField[]) => {
    const result = updatePipelineContractFields(node.id, fields);
    setMessage(result.ok ? '' : result.reason);
    return result.ok;
  }, [node.id, updatePipelineContractFields]);

  const handleSchemaNameChange = useCallback((schemaName: string) => {
    if (node.type !== 'structuredOutput') return;
    const nextSchemaName = schemaName.trim();
    if (!nextSchemaName || nextSchemaName === (node.data as StructuredOutputNodeData).schemaName) return;
    updateNodeData(node.id, { schemaName: nextSchemaName });
  }, [node, updateNodeData]);

  return {
    data,
    fields: data.fields,
    handleFieldsChange,
    handleSchemaNameChange,
    message,
  };
}
