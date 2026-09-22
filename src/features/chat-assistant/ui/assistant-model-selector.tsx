'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useChatRuntime, useChatRuntimeState } from '@prodactionpro/chat-runtime-react';
import { PREFERRED_ANALYSIS_MODEL_IDS } from '@/shared/api/openrouter-models';
import { useOpenRouterModels } from '@/shared/api/use-openrouter-models';
import { ModelSelector } from '@/features/model-selector/ui/model-selector';

/** Match the server's document-assistant allowlist, including its configured default. */
export function AssistantModelSelector({ model, disabled, label }: {
  model: string; disabled?: boolean; label?: string;
}) {
  const tUi = useTranslations();
  label ??= tUi("Модель ассистента");
  const runtime = useChatRuntime(), state = useChatRuntimeState();
  const catalog = useOpenRouterModels();
  const allowed = new Set([model, ...PREFERRED_ANALYSIS_MODEL_IDS]);
  const options = catalog.analysisModels.filter((item) => allowed.has(item.id)).map((item) => ({ value: item.id, label: item.label }));
  if (!options.some((item) => item.value === model)) options.unshift({ value: model, label: model.split('/').pop()! });
  return <ModelSelector modality="text" ariaLabel={label} value={state.selectedModel || model} options={options}
    disabled={disabled || ['loading', 'submitting', 'streaming'].includes(state.phase)}
    surface="liquid" className="home-image-model" onChange={(value) => runtime.setModel(value)} />;
}
