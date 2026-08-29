'use client';

import type { ChatActionSelection } from '@prodactionpro/chat-domain';
import { useChatRuntime, useChatRuntimeState } from '@prodactionpro/chat-runtime-react';
import type { ChatToolRendererContext } from '@prodactionpro/chat-ui';
import { useMemo, useState } from 'react';
import type {
  BaseImageStrategy,
  DetectedDesignElement,
  TextStrategy,
} from '@/modules/chat-assistant/contracts/design-element-selection';
import {
  createAllDesignElementSelection,
  createDesignElementSelectionSubmission,
  createRecommendedDesignElementSelection,
  formatBaseImageStrategy,
  formatTextStrategy,
  normalizeDesignElementSelection,
  readDesignElementSelectionResult,
  readSubmittedDesignElementSelection,
} from '../model/design-element-selection';

export function DesignElementSelectionToolCard({ safeResult, toolCall }: ChatToolRendererContext) {
  const result = readDesignElementSelectionResult(safeResult);
  const runtime = useChatRuntime();
  const runtimeState = useChatRuntimeState();
  const initialDraft = useMemo(
    () => result ? createRecommendedDesignElementSelection(result) : undefined,
    [result],
  );
  const [baseImageStrategy, setBaseImageStrategy] = useState<BaseImageStrategy>(
    initialDraft?.baseImageStrategy ?? 'single-image',
  );
  const [textStrategy, setTextStrategy] = useState<TextStrategy>(initialDraft?.textStrategy ?? 'embedded');
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>(initialDraft?.selectedElementIds ?? []);
  const [customElements, setCustomElements] = useState<string[]>([]);
  const [customDraft, setCustomDraft] = useState('');
  const [sending, setSending] = useState(false);

  if (!result) return null;
  const submitted = readSubmittedDesignElementSelection(runtimeState.messages, result.interactionId);
  const normalized = normalizeDesignElementSelection(result, {
    baseImageStrategy,
    customElements,
    selectedElementIds,
    textStrategy,
  });
  const busy = sending || ['loading', 'submitting', 'streaming'].includes(runtimeState.phase);

  if (submitted) {
    return (
      <section className="design-selection-card design-selection-card-submitted" aria-label="Выбранные элементы макета">
        <span className="design-selection-eyebrow">Настройки макета переданы</span>
        <strong>{formatBaseImageStrategy(submitted.baseImageStrategy)}</strong>
        <span>{formatTextStrategy(submitted.textStrategy)}</span>
        <span>{submitted.selectedElementIds.length + submitted.customElements.length} элементов отдельно</span>
      </section>
    );
  }

  function applyRecommended() {
    const next = createRecommendedDesignElementSelection(result!);
    setBaseImageStrategy(next.baseImageStrategy);
    setTextStrategy(next.textStrategy);
    setSelectedElementIds(next.selectedElementIds);
  }

  function applyAll() {
    const next = createAllDesignElementSelection(result!, customElements);
    setBaseImageStrategy(next.baseImageStrategy);
    setTextStrategy(next.textStrategy);
    setSelectedElementIds(next.selectedElementIds);
  }

  function toggleElement(element: DetectedDesignElement) {
    if (element.role === 'qr') return;
    const selected = selectedElementIds.includes(element.id);
    const nextIds = selected
      ? selectedElementIds.filter((id) => id !== element.id)
      : [...selectedElementIds, element.id];
    setSelectedElementIds(nextIds);
    if (!selected && element.kind === 'text') setTextStrategy('separate');
    if (!selected && element.kind === 'image') setBaseImageStrategy('layered');
  }

  function addCustomElement() {
    const value = customDraft.trim().slice(0, 80);
    if (!value || customElements.includes(value) || customElements.length >= 8) return;
    setCustomElements([...customElements, value]);
    setCustomDraft('');
  }

  async function continueWithSelection() {
    if (busy) return;
    const submission = createDesignElementSelectionSubmission(result!, normalized);
    const selectedAction: ChatActionSelection = {
      id: `design-selection:${result!.interactionId}`,
      label: 'Продолжить с выбранными элементами',
      message: submission.message,
      payload: { ...submission.payload },
      source: {
        blockType: 'tool-result',
        messageId: toolCall.messageId ?? toolCall.id,
      },
      type: 'submit',
    };
    setSending(true);
    try {
      await runtime.submit(submission.message, { selectedAction });
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="design-selection-card" aria-label="Настройка редактируемого макета">
      <div className="design-selection-heading">
        <span className="design-selection-eyebrow">Разбор референса</span>
        <strong>Я разобрал референс и могу собрать похожий макет.</strong>
        <p>
          Выберите, чем вы хотите управлять отдельно. Остальное я объединю в основной арт,
          чтобы быстрее получить рабочий результат.
        </p>
        <small className="design-selection-intent">Задача: {result.intentSummary}</small>
      </div>

      <fieldset className="design-selection-section">
        <legend>Как собирать изображение</legend>
        <StrategyOption
          checked={baseImageStrategy === 'single-image'}
          description="Быстрее: фон, герой и декор создаются одним изображением."
          label="Цельная основа"
          name={`${result.interactionId}:base`}
          onChange={() => {
            setBaseImageStrategy('single-image');
            setSelectedElementIds((ids) => ids.filter((id) => {
              const kind = result.elements.find((element) => element.id === id)?.kind;
              const element = result.elements.find((candidate) => candidate.id === id);
              return kind !== 'image' || element?.role === 'qr';
            }));
          }}
        />
        <StrategyOption
          checked={baseImageStrategy === 'layered'}
          description="Больше контроля: части можно двигать, заменять и перегенерировать отдельно."
          label="Раздельные слои"
          name={`${result.interactionId}:base`}
          onChange={() => setBaseImageStrategy('layered')}
        />
      </fieldset>

      <fieldset className="design-selection-section">
        <legend>Как работать с текстом</legend>
        <StrategyOption
          checked={textStrategy === 'embedded'}
          description="Самый простой первый вариант: текст создаётся прямо в изображении."
          label="Текст внутри изображения"
          name={`${result.interactionId}:text`}
          onChange={() => {
            setTextStrategy('embedded');
            setSelectedElementIds((ids) => ids.filter((id) => (
              result.elements.find((element) => element.id === id)?.kind !== 'text'
            )));
          }}
        />
        <StrategyOption
          checked={textStrategy === 'separate'}
          description="Надписи можно менять, двигать и оформлять независимо."
          label="Текст отдельными слоями"
          name={`${result.interactionId}:text`}
          onChange={() => setTextStrategy('separate')}
        />
      </fieldset>

      <fieldset className="design-selection-section design-selection-elements">
        <legend>Что менять отдельно</legend>
        {result.elements.map((element) => {
          const checked = normalized.selectedElementIds.includes(element.id);
          const locked = element.role === 'qr';
          return (
            <label className="design-selection-element" data-locked={locked} key={element.id}>
              <input
                checked={checked}
                disabled={locked}
                onChange={() => toggleElement(element)}
                type="checkbox"
              />
              <span>
                <b>{element.label}</b>
                {element.observedContent ? <small>{element.observedContent}</small> : null}
              </span>
              {locked ? <em>всегда отдельно</em> : null}
            </label>
          );
        })}
      </fieldset>

      <div className="design-selection-custom">
        <label htmlFor={`${result.interactionId}:custom`}>Добавить свой элемент</label>
        <div>
          <input
            id={`${result.interactionId}:custom`}
            maxLength={80}
            onChange={(event) => setCustomDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              addCustomElement();
            }}
            placeholder="Например, плашка партнёра"
            value={customDraft}
          />
          <button disabled={!customDraft.trim() || customElements.length >= 8} onClick={addCustomElement} type="button">
            Добавить
          </button>
        </div>
        {customElements.length ? (
          <ul>
            {customElements.map((element) => (
              <li key={element}>
                <span>{element}</span>
                <button
                  aria-label={`Убрать ${element}`}
                  onClick={() => setCustomElements(customElements.filter((item) => item !== element))}
                  type="button"
                >×</button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <p className="design-selection-reason">{result.recommendationReason}</p>
      <div className="design-selection-actions">
        <button disabled={busy} onClick={applyRecommended} type="button">Рекомендованные</button>
        <button disabled={busy} onClick={applyAll} type="button">Выбрать всё</button>
        <button className="design-selection-continue" disabled={busy} onClick={() => void continueWithSelection()} type="button">
          {sending
            ? 'Передаю выбор…'
            : `Продолжить · ${normalized.selectedElementIds.length + normalized.customElements.length} отдельно`}
        </button>
      </div>
    </section>
  );
}

function StrategyOption({ checked, description, label, name, onChange }: {
  checked: boolean;
  description: string;
  label: string;
  name: string;
  onChange: () => void;
}) {
  return (
    <label className="design-selection-strategy">
      <input checked={checked} name={name} onChange={onChange} type="radio" />
      <span><b>{label}</b><small>{description}</small></span>
    </label>
  );
}
