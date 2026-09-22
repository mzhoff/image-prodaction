'use client';
import { useUiCatalog } from '@/shared/i18n/use-ui-catalog';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useOpenRouterModels } from '@/shared/api/use-openrouter-models';
import { ModelSelector } from '@/features/model-selector/ui/model-selector';
import { DarkSelect } from '@/shared/ui/dark-select';
import type { HomeTextSettings } from '@/modules/chat-assistant/contracts/home-text-settings';

const temperatureOptions = Array.from({ length: 21 }, (_, index) => ({
  value: (index / 10).toFixed(1), label: `Температура · ${(index / 10).toFixed(1)}`,
}));
const reasoningOptions = [
  { value: 'low', label: 'Рассуждение · Низкое' },
  { value: 'medium', label: 'Рассуждение · Среднее' },
  { value: 'high', label: 'Рассуждение · Высокое' },
];

export function HomeTextSettingsControls({ value, onChange, defaultModel, disabled }: {
  value: HomeTextSettings; onChange: (value: HomeTextSettings) => void; defaultModel: string; disabled: boolean;
}) {
  const tUi = useTranslations();
  const ui_temperatureOptions = useUiCatalog(temperatureOptions, tUi);
  const ui_reasoningOptions = useUiCatalog(reasoningOptions, tUi);
  const catalog = useOpenRouterModels();
  const options = catalog.analysisModels.map((model) => ({ value: model.id, label: model.label }));
  if (!options.some((option) => option.value === defaultModel)) options.unshift({ value: defaultModel, label: defaultModel.split('/').pop()! });
  const parameters = catalog.analysisModels.find((model) => model.id === value.model)?.supportedParameters ?? [];
  return <>
    <ModelSelector modality="text" ariaLabel={tUi("Текстовая модель")} value={value.model} options={options} disabled={disabled}
      surface="liquid" className="home-image-model" onChange={(model) => onChange({ ...value, model })} />
    {parameters.includes('temperature') ? <DarkSelect surface="liquid" ariaLabel={tUi("Температура текста")}
      value={(value.temperature ?? 1).toFixed(1)} options={ui_temperatureOptions} disabled={disabled}
      onChange={(temperature) => onChange({ ...value, temperature: Number(temperature) })} /> : null}
    {parameters.includes('reasoning') ? <DarkSelect surface="liquid" ariaLabel={tUi("Глубина рассуждения")}
      value={value.reasoning ?? 'low'} options={ui_reasoningOptions} disabled={disabled}
      onChange={(reasoning) => onChange({ ...value, reasoning: reasoning as HomeTextSettings['reasoning'] })} /> : null}
  </>;
}
