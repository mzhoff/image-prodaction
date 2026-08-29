'use client';

import { useEffect, useState } from 'react';
import type {
  PipelineContractField,
  PipelineContractFieldKind,
} from '@/entities/production-graph/model/types';

interface PipelineContractFieldDetailsProps {
  allowDefault: boolean;
  field: PipelineContractField;
  onChange: (field: PipelineContractField) => boolean;
}

export function PipelineContractFieldDetails({
  allowDefault,
  field,
  onChange,
}: PipelineContractFieldDetailsProps) {
  const [descriptionDraft, setDescriptionDraft] = useState(field.description ?? '');
  const [defaultDraft, setDefaultDraft] = useState(formatDefaultValue(field));
  const [defaultError, setDefaultError] = useState('');

  useEffect(() => {
    setDescriptionDraft(field.description ?? '');
  }, [field.description]);

  useEffect(() => {
    setDefaultDraft(formatDefaultValue(field));
    setDefaultError('');
  }, [field]);

  const commitDescription = () => {
    const description = descriptionDraft.trim();
    if (description === (field.description ?? '')) return;
    onChange({ ...field, description: description || undefined });
  };

  const commitDefault = () => {
    const value = parseDefaultValue(defaultDraft, field.kind);
    if (!value.ok) {
      setDefaultError(value.reason);
      setDefaultDraft(formatDefaultValue(field));
      return;
    }
    setDefaultError('');
    onChange({ ...field, defaultValue: value.value });
  };

  return (
    <div className="pipeline-contract-field-details">
      <label>
        <span>Description</span>
        <input
          value={descriptionDraft}
          placeholder="What this value means"
          onBlur={commitDescription}
          onChange={(event) => setDescriptionDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
        />
      </label>
      {!allowDefault ? (
        <p>Defaults are configured only for values supplied through Pipeline Input.</p>
      ) : field.required ? (
        <p>Default values are available for optional fields.</p>
      ) : field.kind === 'image' ? (
        <p>Image defaults are not supported. Supply an asset when the pipeline starts.</p>
      ) : field.kind === 'boolean' ? (
        <label>
          <span>Default</span>
          <select
            value={typeof field.defaultValue === 'boolean' ? String(field.defaultValue) : ''}
            onChange={(event) => onChange({
              ...field,
              defaultValue: event.target.value === '' ? undefined : event.target.value === 'true',
            })}
          >
            <option value="">Not set</option>
            <option value="true">True</option>
            <option value="false">False</option>
          </select>
        </label>
      ) : (
        <label>
          <span>Default{field.kind === 'json' ? ' JSON' : ''}</span>
          {field.kind === 'json' ? (
            <textarea
              value={defaultDraft}
              aria-invalid={Boolean(defaultError)}
              placeholder={'{\n  "key": "value"\n}'}
              onBlur={commitDefault}
              onChange={(event) => {
                setDefaultDraft(event.target.value);
                if (defaultError) setDefaultError('');
              }}
            />
          ) : (
            <input
              type={field.kind === 'number' ? 'number' : 'text'}
              value={defaultDraft}
              aria-invalid={Boolean(defaultError)}
              placeholder="Not set"
              onBlur={commitDefault}
              onChange={(event) => {
                setDefaultDraft(event.target.value);
                if (defaultError) setDefaultError('');
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
            />
          )}
          {defaultError ? (
            <span className="pipeline-contract-default-error" role="alert">{defaultError}</span>
          ) : null}
        </label>
      )}
    </div>
  );
}

function formatDefaultValue(field: PipelineContractField) {
  if (field.defaultValue === undefined || field.defaultValue === null) return '';
  if (field.kind === 'json') {
    try {
      return JSON.stringify(field.defaultValue, null, 2);
    } catch {
      return '';
    }
  }
  return String(field.defaultValue);
}

function parseDefaultValue(value: string, kind: PipelineContractFieldKind):
  | { ok: true; value: PipelineContractField['defaultValue'] }
  | { ok: false; reason: string } {
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: undefined };
  if (kind === 'text') return { ok: true, value };
  if (kind === 'number') {
    const numberValue = Number(trimmed);
    return Number.isFinite(numberValue)
      ? { ok: true, value: numberValue }
      : { ok: false, reason: 'Enter a valid number.' };
  }
  if (kind === 'json') {
    try {
      return { ok: true, value: JSON.parse(trimmed) as PipelineContractField['defaultValue'] };
    } catch {
      return { ok: false, reason: 'Enter valid JSON.' };
    }
  }
  return { ok: true, value: undefined };
}
