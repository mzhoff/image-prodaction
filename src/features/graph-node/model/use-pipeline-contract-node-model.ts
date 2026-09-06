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
import {
  getPipelineSemanticContractPreset,
  getPipelineSemanticContractPresets,
} from '@/entities/production-graph/model/pipeline-semantic-contract-presets';

type PipelineContractNodeData =
  | PipelineInputNodeData
  | PipelineOutputNodeData
  | StructuredOutputNodeData;

export function usePipelineContractNodeModel(node: ProductionNode) {
  const data = node.data as PipelineContractNodeData;
  const applyPipelineSemanticContractPreset = useProductionGraphStore(
    (state) => state.applyPipelineSemanticContractPreset,
  );
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

  const boundary = node.type === 'pipelineInput'
    ? 'input'
    : node.type === 'pipelineOutput'
      ? 'output'
      : undefined;
  const semanticContract = boundary ? (data as PipelineInputNodeData | PipelineOutputNodeData).semanticContract : undefined;
  const semanticContractPresets = boundary ? getPipelineSemanticContractPresets(boundary) : [];

  const handleSemanticContractPresetChange = useCallback((contractKey: string) => {
    if (!boundary) return;
    if (!contractKey) {
      updateNodeData(node.id, { semanticContract: undefined });
      setMessage('');
      return;
    }
    const preset = getPipelineSemanticContractPreset(contractKey);
    if (!preset || preset.boundary !== boundary) return;
    const result = applyPipelineSemanticContractPreset(
      node.id,
      preset.fields,
      preset.semanticContract,
    );
    if (!result.ok) {
      setMessage(result.reason);
      return;
    }
    setMessage('');
  }, [applyPipelineSemanticContractPreset, boundary, node.id, updateNodeData]);

  return {
    data,
    fields: data.fields,
    handleFieldsChange,
    handleSchemaNameChange,
    handleSemanticContractPresetChange,
    message,
    semanticContract,
    semanticContractPresets,
  };
}
