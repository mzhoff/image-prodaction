import {
  createPipelineContractField,
  PIPELINE_CONTRACT_MAX_FIELDS,
  type PipelineContractField,
} from '@/entities/production-graph/model/types';

export function countPipelineContractFields(fields: PipelineContractField[]): number {
  return fields.reduce(
    (count, field) => count + 1 + countPipelineContractFields(field.fields ?? []),
    0,
  );
}

export function createUniquePipelineContractField(
  siblings: PipelineContractField[],
  preferredKey?: string,
) {
  const usedKeys = new Set(siblings.map((field) => field.key));
  let index = siblings.length;
  let key = preferredKey?.trim() || `field_${index + 1}`;

  while (usedKeys.has(key)) {
    index += 1;
    key = `field_${index + 1}`;
  }

  return createPipelineContractField(index, { key });
}

export function updatePipelineContractField(
  fields: PipelineContractField[],
  fieldId: string,
  update: (field: PipelineContractField) => PipelineContractField,
): PipelineContractField[] {
  let changed = false;
  const nextFields = fields.map((field) => {
    if (field.id === fieldId) {
      changed = true;
      return update(field);
    }

    if (!field.fields?.length) return field;
    const nextChildren = updatePipelineContractField(field.fields, fieldId, update);
    if (nextChildren === field.fields) return field;
    changed = true;
    return { ...field, fields: nextChildren };
  });

  return changed ? nextFields : fields;
}

export function removePipelineContractField(
  fields: PipelineContractField[],
  fieldId: string,
): PipelineContractField[] {
  const filtered = fields.filter((field) => field.id !== fieldId);
  if (filtered.length !== fields.length) return filtered;

  let changed = false;
  const nextFields = fields.map((field) => {
    if (!field.fields?.length) return field;
    const nextChildren = removePipelineContractField(field.fields, fieldId);
    if (nextChildren === field.fields) return field;
    changed = true;
    return { ...field, fields: nextChildren };
  });

  return changed ? nextFields : fields;
}

export function addPipelineContractChild(
  fields: PipelineContractField[],
  parentFieldId: string,
): PipelineContractField[] {
  if (countPipelineContractFields(fields) >= PIPELINE_CONTRACT_MAX_FIELDS) return fields;

  return updatePipelineContractField(fields, parentFieldId, (field) => {
    if (field.kind !== 'json') return field;
    const children = field.fields ?? [];
    return {
      ...field,
      fields: [...children, createUniquePipelineContractField(children)],
    };
  });
}
