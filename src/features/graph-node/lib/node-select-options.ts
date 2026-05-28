import type { OpenRouterModelOption } from '@/shared/api/openrouter-models';

export function modelSelectOptions(models: OpenRouterModelOption[]) {
  return models.map((model) => ({ value: model.id, label: model.label }));
}

export function valueSelectOptions(values: string[]) {
  return values.map((value) => ({ value, label: value }));
}

export function getSelectedModelId(models: OpenRouterModelOption[], current: string | undefined, fallback: string) {
  if (current && models.some((model) => model.id === current)) return current;
  return models[0]?.id ?? current ?? fallback;
}
