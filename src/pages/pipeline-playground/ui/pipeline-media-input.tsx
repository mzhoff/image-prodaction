'use client';
import { useUiCatalog } from '@/shared/i18n/use-ui-catalog';
import { useTranslations } from '@/shared/i18n/use-translations';

import Image from 'next/image';
import { useRef, useState } from 'react';
import { AudioLines, Check, ImagePlus, LoaderCircle, Upload, Video, X } from '@prodactionpro/ui-core/icons';
import type { PipelineArtifactReference } from '@/modules/executable-pipelines/contracts/pipeline-contracts';
import type { PipelinePlaygroundField } from '@/modules/executable-pipelines/contracts/pipeline-playground-contracts';
import type { PipelinePlaygroundDraft } from '../model/pipeline-playground-inputs';
import { isArtifactReference } from '../model/pipeline-playground-values';
import { PLAYGROUND_MEDIA, playgroundMediaKind } from '../model/pipeline-playground-media';

export function PipelineMediaInput({ field, fieldId, describedBy, draft, disabled, uploading, pendingNames, invalid,
  onChange, onUpload }: {
  field: PipelinePlaygroundField; fieldId: string; describedBy?: string; draft: PipelinePlaygroundDraft;
  disabled: boolean; uploading: boolean; pendingNames: string[]; invalid: boolean;
  onChange(value: PipelinePlaygroundDraft): void; onUpload(files: File[]): void;
}) {
  const tUi = useTranslations();
  const ui_PLAYGROUND_MEDIA = useUiCatalog(PLAYGROUND_MEDIA, tUi);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const kind = playgroundMediaKind(field.kind)!;
  const policy = ui_PLAYGROUND_MEDIA[kind];
  const Icon = kind === 'video' ? Video : kind === 'audio' ? AudioLines : ImagePlus;
  const artifacts = (Array.isArray(draft) ? draft : isArtifactReference(draft) ? [draft] : []).filter((item) => item.kind === kind);
  const blocked = disabled || uploading;
  return <div className="playground-media-input" data-drag-over={dragOver} data-kind={kind} aria-busy={uploading}
    onDragOver={(event) => {
      if (!event.dataTransfer.types.includes('Files')) return;
      event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = blocked ? 'none' : 'copy';
      if (!blocked) setDragOver(true);
    }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(false); }}
    onDrop={(event) => { event.preventDefault(); event.stopPropagation(); setDragOver(false); if (!blocked) onUpload(Array.from(event.dataTransfer.files)); }}>
    {artifacts.length || pendingNames.length ? <div className={`playground-media-previews ${kind === 'image' && field.kind === 'image_collection' ? 'playground-media-previews-grid' : ''}`}>
      {artifacts.map((artifact, index) => <div className="playground-media-preview" key={`${artifact.assetId}-${index}`}>
        <PipelineMediaPreview artifact={artifact} label={field.label} />
        <div className="playground-media-caption"><span><Check size={12} />{String(artifact.originalName ?? policy.label)}</span>
          <button type="button" disabled={blocked} aria-label={tUi("Убрать {p1}", { p1: String(artifact.originalName ?? policy.label) })}
            onClick={() => onChange(field.kind === 'image_collection' ? artifacts.filter((_, i) => i !== index) : undefined)}><X size={14} /></button></div>
      </div>)}
      {pendingNames.map((name, index) => <div className="playground-media-pending" role="status" key={`${name}-${index}`}>
        <LoaderCircle className="playground-spinner" size={23} /><strong>{name}</strong><span>{index === 0 ? tUi("Загружаем и подготавливаем…") : tUi("В очереди на загрузку")}</span>
      </div>)}
    </div> : null}
    <button type="button" className="playground-media-drop" data-compact={Boolean(artifacts.length || pendingNames.length)}
      id={fieldId} disabled={blocked} aria-describedby={describedBy} data-invalid={invalid || undefined}
      onClick={() => inputRef.current?.click()}>
      <span className="playground-media-drop-icon">{artifacts.length ? <Upload size={18} /> : <Icon size={28} />}</span>
      <strong>{uploading ? tUi("Подготовка файлов…") : artifacts.length ? field.kind === 'image_collection' ? tUi("Добавить ещё изображения") : tUi("Заменить файл") : policy.action}</strong>
      {!artifacts.length && !uploading ? <span>{tUi("Перетащите сюда или выберите с компьютера")}</span> : null}
      <small>{policy.hint}</small>
    </button>
    <input ref={inputRef} type="file" hidden accept={policy.accept} multiple={field.kind === 'image_collection'} disabled={blocked}
      aria-label={policy.action} onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = ''; onUpload(files); }} />
  </div>;
}

export function PipelineMediaPreview({ artifact, label }: { artifact: PipelineArtifactReference; label: string }) {
  const tUi = useTranslations();
  const [failed, setFailed] = useState(false);
  const source = `/api/assets/${encodeURIComponent(artifact.assetId)}/content`;
  if (failed) return <div className="playground-media-fallback"><span>{tUi("Файл готов. Этот формат нельзя просмотреть в браузере.")}</span><a href={source} download>{tUi("Скачать файл")}</a></div>;
  if (artifact.kind === 'video') return <video key={source} src={source} controls preload="metadata" aria-label={label} onError={() => setFailed(true)} />;
  if (artifact.kind === 'audio') return <div className="playground-audio-preview"><AudioLines size={30} /><audio key={source} src={source} controls preload="metadata" aria-label={label} onError={() => setFailed(true)} /></div>;
  return <Image src={source} alt={label} width={artifact.width ?? 800} height={artifact.height ?? 600} unoptimized onError={() => setFailed(true)} draggable={false} />;
}
