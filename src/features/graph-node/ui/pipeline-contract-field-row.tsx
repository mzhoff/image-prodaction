'use client';

import {
  Asterisk,
  ChevronDown,
  ChevronRight,
  Plus,
  Settings2,
  Trash2,
} from 'lucide-react';
import {
  memo,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import {
  getPipelineFieldPortId,
  isPipelineContractFieldKind,
  isValidPipelineFieldKey,
  PIPELINE_CONTRACT_FIELD_KINDS,
  PIPELINE_CONTRACT_MAX_DEPTH,
  PIPELINE_CONTRACT_MAX_FIELDS,
  type PipelineContractField,
  type PipelineContractFieldKind,
} from '@/entities/production-graph/model/types';
import { DarkSelect, type DarkSelectOption } from '@/shared/ui/dark-select';
import {
  addPipelineContractChild,
  countPipelineContractFields,
  removePipelineContractField,
  updatePipelineContractField,
} from '../lib/pipeline-contract-field-tree';
import { PipelineContractFieldDetails } from './pipeline-contract-field-details';
import { PortButton } from './port-button';

const PIPELINE_FIELD_TYPE_LABELS: Record<PipelineContractFieldKind, string> = {
  text: 'Text',
  number: 'Number',
  boolean: 'Boolean',
  image: 'Image',
  json: 'JSON',
};

const PIPELINE_FIELD_TYPE_OPTIONS: DarkSelectOption[] = PIPELINE_CONTRACT_FIELD_KINDS.map((kind) => ({
  label: PIPELINE_FIELD_TYPE_LABELS[kind],
  value: kind,
}));

const PIPELINE_STRUCTURED_FIELD_TYPE_OPTIONS = PIPELINE_FIELD_TYPE_OPTIONS.filter(
  (option) => option.value !== 'image',
);

export interface PipelineContractFieldRowProps {
  allFields: PipelineContractField[];
  allowDefault: boolean;
  allowImage: boolean;
  canRemove: boolean;
  childrenContent?: ReactNode;
  depth: number;
  field: PipelineContractField;
  nodeId: string;
  onFieldsChange: (fields: PipelineContractField[]) => boolean;
  onStartConnection: (nodeId: string, portId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
  portSide: 'input' | 'output';
  siblingFields: PipelineContractField[];
}

export const PipelineContractFieldRow = memo(function PipelineContractFieldRow({
  allFields,
  allowDefault,
  allowImage,
  canRemove,
  childrenContent,
  depth,
  field,
  nodeId,
  onFieldsChange,
  onStartConnection,
  portSide,
  siblingFields,
}: PipelineContractFieldRowProps) {
  const [draftKey, setDraftKey] = useState(field.key);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [keyError, setKeyError] = useState('');
  const cancelCommitRef = useRef(false);
  const isJson = field.kind === 'json';
  const canAddNested = isJson
    && depth + 1 < PIPELINE_CONTRACT_MAX_DEPTH
    && countPipelineContractFields(allFields) < PIPELINE_CONTRACT_MAX_FIELDS;
  const showPort = depth === 0;
  const rowStyle = { '--pipeline-contract-field-depth': depth } as CSSProperties;
  const typeOptions = allowImage
    ? PIPELINE_FIELD_TYPE_OPTIONS
    : PIPELINE_STRUCTURED_FIELD_TYPE_OPTIONS;

  useEffect(() => {
    setDraftKey(field.key);
  }, [field.key]);

  const commitKey = () => {
    if (cancelCommitRef.current) {
      cancelCommitRef.current = false;
      setKeyError('');
      return;
    }

    const nextKey = draftKey.trim();
    if (!isValidPipelineFieldKey(nextKey)) {
      setDraftKey(field.key);
      setKeyError('Use letters, numbers and underscores; start with a letter or underscore.');
      return;
    }
    const duplicate = siblingFields.some(
      (candidate) => candidate.id !== field.id && candidate.key === nextKey,
    );
    if (duplicate) {
      setDraftKey(field.key);
      setKeyError('Field keys must be unique at the same level.');
      return;
    }
    setKeyError('');
    if (nextKey === field.key) return;
    onFieldsChange(updatePipelineContractField(allFields, field.id, (current) => ({
      ...current,
      key: nextKey,
    })));
  };

  const handleTypeChange = (value: string) => {
    if (!isPipelineContractFieldKind(value) || value === field.kind) return;
    onFieldsChange(updatePipelineContractField(allFields, field.id, (current) => ({
      ...current,
      kind: value,
      defaultValue: undefined,
      ...(value === 'json' ? { fields: current.fields ?? [] } : { fields: undefined }),
    })));
  };

  return (
    <div
      className="pipeline-contract-field-branch"
      data-depth={depth}
      role="listitem"
      style={rowStyle}
    >
      <div className="pipeline-contract-field-row">
        <button
          type="button"
          className="pipeline-contract-field-disclosure"
          aria-label={expanded ? `Collapse ${field.key}` : `Expand ${field.key}`}
          aria-expanded={isJson ? expanded : undefined}
          disabled={!isJson}
          onClick={() => setExpanded((current) => !current)}
        >
          {isJson ? (expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : <span />}
        </button>
        <input
          className="pipeline-contract-field-key"
          value={draftKey}
          aria-label="Contract field key"
          aria-invalid={Boolean(keyError)}
          onBlur={commitKey}
          onChange={(event) => {
            setDraftKey(event.target.value);
            if (keyError) setKeyError('');
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              event.currentTarget.blur();
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              cancelCommitRef.current = true;
              setDraftKey(field.key);
              event.currentTarget.blur();
            }
          }}
          title={keyError || field.key}
        />
        <DarkSelect
          ariaLabel={`Type for ${field.key}`}
          className="pipeline-contract-type-select"
          value={field.kind}
          options={typeOptions}
          onChange={handleTypeChange}
        />
        <button
          type="button"
          className={`pipeline-contract-required-toggle${field.required ? ' is-active' : ''}`}
          aria-label={field.required ? `${field.key} is required` : `${field.key} is optional`}
          aria-pressed={field.required}
          title={field.required ? 'Required field' : 'Optional field'}
          onClick={() => onFieldsChange(updatePipelineContractField(allFields, field.id, (current) => ({
            ...current,
            required: !current.required,
            ...(!current.required ? { defaultValue: undefined } : undefined),
          })))}
        >
          <Asterisk size={13} />
        </button>
        <button
          type="button"
          className={`pipeline-contract-field-action${detailsOpen ? ' is-active' : ''}`}
          aria-label={`Configure ${field.key}`}
          aria-expanded={detailsOpen}
          title="Description and default value"
          onClick={() => setDetailsOpen((current) => !current)}
        >
          <Settings2 size={13} />
        </button>
        {isJson ? (
          <button
            type="button"
            className="pipeline-contract-field-action"
            aria-label={`Add nested field to ${field.key}`}
            disabled={!canAddNested}
            title={canAddNested ? 'Add nested JSON field' : 'Maximum schema depth or field count reached'}
            onClick={() => {
              setExpanded(true);
              onFieldsChange(addPipelineContractChild(allFields, field.id));
            }}
          >
            <Plus size={13} />
          </button>
        ) : null}
        <button
          type="button"
          className="pipeline-contract-field-action pipeline-contract-field-remove"
          aria-label={`Remove ${field.key}`}
          disabled={!canRemove}
          title={canRemove ? 'Remove field' : 'A contract must contain at least one field'}
          onClick={() => onFieldsChange(removePipelineContractField(allFields, field.id))}
        >
          <Trash2 size={13} />
        </button>
        {showPort ? (
          <PortButton
            nodeId={nodeId}
            portId={getPipelineFieldPortId(field.id)}
            side={portSide}
            kind={field.kind}
            label={field.key}
            className="node-port-row pipeline-contract-field-port"
            onStartConnection={onStartConnection}
          />
        ) : null}
      </div>
      {keyError ? <div className="pipeline-contract-field-key-error" role="alert">{keyError}</div> : null}
      {detailsOpen ? (
        <PipelineContractFieldDetails
          allowDefault={allowDefault}
          field={field}
          onChange={(nextField) => onFieldsChange(updatePipelineContractField(
            allFields,
            field.id,
            () => nextField,
          ))}
        />
      ) : null}
      {isJson && expanded ? (
        <div className="pipeline-contract-field-children">
          {childrenContent ?? (
            <button
              type="button"
              className="pipeline-contract-empty-json"
              disabled={!canAddNested}
              onClick={() => onFieldsChange(addPipelineContractChild(allFields, field.id))}
            >
              <Plus size={12} /> Add nested field
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
});
