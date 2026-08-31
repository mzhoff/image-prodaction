'use client';

import { Plus } from 'lucide-react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  getPipelineFieldPortId,
  PIPELINE_CONTRACT_MAX_FIELDS,
  type PipelineContractField,
} from '@/entities/production-graph/model/types';
import {
  countPipelineContractFields,
  createUniquePipelineContractField,
} from '../lib/pipeline-contract-field-tree';
import { PipelineContractFieldRow } from './pipeline-contract-field-row';
import { PortButton } from './port-button';

export interface PipelineContractFieldListProps {
  allowDefaults?: boolean;
  allowImageFields?: boolean;
  fields: PipelineContractField[];
  nodeId: string;
  onFieldsChange: (fields: PipelineContractField[]) => boolean;
  onStartConnection: (nodeId: string, portId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
  portSide: 'input' | 'output';
  readOnly?: boolean;
}

export function PipelineContractFieldList({
  allowDefaults = false,
  allowImageFields = false,
  fields,
  nodeId,
  onFieldsChange,
  onStartConnection,
  portSide,
  readOnly = false,
}: PipelineContractFieldListProps) {
  const fieldCount = countPipelineContractFields(fields);
  const canAddField = fieldCount < PIPELINE_CONTRACT_MAX_FIELDS;

  return (
    <div className="pipeline-contract-fields" data-node-interactive>
      <PipelineContractFieldLevel
        allFields={fields}
        allowDefaults={allowDefaults}
        allowImageFields={allowImageFields}
        depth={0}
        fields={fields}
        nodeId={nodeId}
        onFieldsChange={onFieldsChange}
        onStartConnection={onStartConnection}
        portSide={portSide}
        readOnly={readOnly}
      />
      <button
        type="button"
        className="pipeline-contract-add-field"
        disabled={readOnly || !canAddField}
        onClick={() => {
          if (!canAddField) return;
          onFieldsChange([...fields, createUniquePipelineContractField(fields)]);
        }}
      >
        <Plus size={14} />
        <span>Add field</span>
        <span className="pipeline-contract-field-limit">{fieldCount}/{PIPELINE_CONTRACT_MAX_FIELDS}</span>
      </button>
    </div>
  );
}

interface PipelineContractFieldLevelProps extends Omit<PipelineContractFieldListProps, 'fields'> {
  allFields: PipelineContractField[];
  depth: number;
  fields: PipelineContractField[];
}

function PipelineContractFieldLevel({
  allFields,
  allowDefaults = false,
  allowImageFields = false,
  depth,
  fields,
  nodeId,
  onFieldsChange,
  onStartConnection,
  portSide,
  readOnly = false,
}: PipelineContractFieldLevelProps) {
  return (
    <div className="pipeline-contract-field-level" role="list">
      {fields.map((field) => {
        const children = field.fields ?? [];
        const childrenContent = children.length ? (
          <PipelineContractFieldLevel
            allFields={allFields}
            allowDefaults={allowDefaults}
            allowImageFields={false}
            depth={depth + 1}
            fields={children}
            nodeId={nodeId}
            onFieldsChange={onFieldsChange}
            onStartConnection={onStartConnection}
            portSide={portSide}
            readOnly={readOnly}
          />
        ) : undefined;

        return (
          <PipelineContractFieldRow
            key={field.id}
            allFields={allFields}
            allowDefault={allowDefaults}
            allowImage={allowImageFields && depth === 0}
            canRemove={depth > 0 || fields.length > 1}
            childrenContent={childrenContent}
            depth={depth}
            field={field}
            nodeId={nodeId}
            onFieldsChange={onFieldsChange}
            onStartConnection={onStartConnection}
            portSide={portSide}
            siblingFields={fields}
            readOnly={readOnly}
          />
        );
      })}
    </div>
  );
}

export function CollapsedPipelineFieldPorts({
  fields,
  nodeId,
  onStartConnection,
  portSide,
}: Omit<PipelineContractFieldListProps, 'allowDefaults' | 'allowImageFields' | 'onFieldsChange'>) {
  return fields.map((field) => (
    <PortButton
      key={field.id}
      nodeId={nodeId}
      portId={getPipelineFieldPortId(field.id)}
      side={portSide}
      kind={field.kind}
      label={field.key}
      className="pipeline-contract-field-port"
      style={{ top: 20 }}
      onStartConnection={onStartConnection}
    />
  ));
}
