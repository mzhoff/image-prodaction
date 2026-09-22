'use client';
import { useFormatLocale } from '@/shared/i18n/use-format-locale';
import { useUiCatalog } from '@/shared/i18n/use-ui-catalog';
import { useTranslations } from '@/shared/i18n/use-translations';
import { Input as PuiInput } from '@prodactionpro/ui-core/input';
import { TextareaControl as PuiTextarea } from '@prodactionpro/ui-core/textarea-control';
import { Check, Code2 } from '@prodactionpro/ui-core/icons';
import type { PipelinePlaygroundField } from '@/modules/executable-pipelines/contracts/pipeline-playground-contracts';
import type { PipelinePlaygroundDraft } from '../model/pipeline-playground-inputs';
import { PIPELINE_KIND_LABELS, pipelineSchemaExample } from '../model/pipeline-field-presentation';
import { playgroundMediaKind } from '../model/pipeline-playground-media';
import { PipelineMediaInput } from './pipeline-media-input';

export function PipelineInputField({ draft, error, field, onChange, onUpload, uploading, pendingNames = [], disabled = false }: {
  draft: PipelinePlaygroundDraft; error?: string; field: PipelinePlaygroundField;
  onChange(value: PipelinePlaygroundDraft): void; onUpload(files: File[]): void;
  uploading: boolean; pendingNames?: string[]; disabled?: boolean;
}) {
  const language = useFormatLocale();
  const tUi = useTranslations();
  const ui_PIPELINE_KIND_LABELS = useUiCatalog(PIPELINE_KIND_LABELS, tUi);
  const fieldId = `playground-input-${field.name}`;
  const describedBy = [`${fieldId}-hint`, field.description ? `${fieldId}-description` : '', error ? `${fieldId}-error` : ''].filter(Boolean).join(' ');
  const mediaKind = playgroundMediaKind(field.kind);
  const jsonLike = field.kind === 'json' || field.kind === 'publication';
  const example = JSON.stringify(pipelineSchemaExample(field.schema, 0, tUi("Ваш текст")), null, 2);
  return <div className={`playground-field ${error ? 'playground-field-error' : ''}`} data-kind={field.kind}>
    <div className="playground-field-label"><label htmlFor={fieldId}>{field.label}</label><span>{field.required ? tUi("Обязательно") : tUi("Необязательно")}</span></div>
    <span className="playground-field-kind" id={`${fieldId}-hint`}>{ui_PIPELINE_KIND_LABELS[field.kind]}</span>
    {field.description ? <p id={`${fieldId}-description`}>{field.description}</p> : null}
    {mediaKind ? <PipelineMediaInput field={field} fieldId={fieldId} describedBy={describedBy} draft={draft} disabled={disabled}
      uploading={uploading} pendingNames={pendingNames} invalid={Boolean(error)} onChange={onChange} onUpload={onUpload} />
      : field.kind === 'boolean' ? <div className="playground-choice-group" id={fieldId} role="group" aria-label={field.label} aria-describedby={describedBy}>
        {(!field.required ? [undefined, true, false] : [true, false]).map((value) => <button type="button" key={String(value)} disabled={disabled}
          aria-pressed={draft === value} onClick={() => onChange(value)}>{draft === value ? <Check size={14} /> : null}{value === undefined ? tUi("Не задано") : value ? tUi("Да") : tUi("Нет")}</button>)}
      </div>
      : field.kind === 'number' ? <PuiInput aria-describedby={describedBy} aria-invalid={Boolean(error)} disabled={disabled} id={fieldId} inputMode="decimal"
        type="number" step="any" placeholder={tUi("Введите число")} value={typeof draft === 'string' ? draft : ''} onChange={(event) => onChange(event.target.value)} />
      : <>
        <PuiTextarea aria-describedby={describedBy} aria-invalid={Boolean(error)} disabled={disabled} id={fieldId}
          onChange={(event) => onChange(event.target.value)} rows={jsonLike ? 7 : 5} spellCheck={!jsonLike}
          placeholder={jsonLike ? example : field.kind === 'text_collection' ? tUi("Каждый текст — с новой строки") : field.description || tUi("Введите {p1}…", { p1: field.label.toLocaleLowerCase(language) })}
          value={typeof draft === 'string' ? draft : ''} />
        {field.kind === 'text_collection' ? <small>{tUi("Одна строка — один элемент списка.")}</small> : null}
        {jsonLike ? <details className="playground-format-hint"><summary><Code2 size={14} />{tUi("Формат данных")}</summary>
          <p>{field.documentFormat ? tUi("Нужен JSON-документ Stories v1.") : field.schema ? tUi("Используйте структуру, заданную автором pipeline.") : field.kind === 'publication' ? tUi("Введите JSON-объект публикации.") : tUi("Введите JSON-объект или массив.")}</p>
          {field.schema ? <pre>{example}</pre> : null}
        </details> : null}
      </>}
    {error ? <span className="playground-field-error-text" id={`${fieldId}-error`} role="alert">{typeof (error) === 'string' ? tUi((error) as string) : (error)}</span> : null}
  </div>;
}
