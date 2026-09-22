'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Plus } from '@prodactionpro/ui-core/icons';
import type { HomeAttachments } from '../model/use-home-image-submit';
import { ComposerMaterials } from './composer-materials';

/** Shared liquid composer surface; conversation and upload lifecycle stay in ChatModule. */
export function ProductionComposerFrame({ attachments, busy, inputDisabled, value, onChange, onSubmit, inputLabel, placeholder, formLabel, parameters, tools, materials, prefix, autoFocus = false, mode, compact = false }: {
  attachments: HomeAttachments; busy: boolean; inputDisabled?: boolean;
  value: string; onChange: (value: string) => void; onSubmit: () => void;
  inputLabel: string; placeholder: string; formLabel: string;
  parameters?: ReactNode; tools: ReactNode; materials?: ReactNode; prefix?: ReactNode; autoFocus?: boolean;
  mode?: string; compact?: boolean;
}) {
  const tUi = useTranslations();
  const promptInput = useRef<HTMLTextAreaElement>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [fileNotice, setFileNotice] = useState('');
  const checkFiles = (files: File[]) => {
    const accepted = files.filter(attachments.acceptsFile);
    setFileNotice(accepted.length !== files.length ? tUi("Часть файлов не подходит: проверьте формат и размер до 8 МБ.")
      : files.length > 3 - attachments.items.length ? tUi("Можно прикрепить до 3 файлов. Остальные не добавлены.") : '');
  };
  useLayoutEffect(() => {
    const input = promptInput.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(220, Math.max(42, input.scrollHeight))}px`;
  }, [value]);
  return <>{fileNotice ? <p className="production-composer-notice" role="status">{fileNotice}</p> : null}<div className="home-image-composer">
    {prefix}
    <form className="home-image-form production-composer-dropzone" aria-label={formLabel} data-dropping={dragging} data-compact={compact}
      onSubmit={(event) => { event.preventDefault(); onSubmit(); }}
    onDragOver={(event) => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = busy ? 'none' : 'copy'; setDragging(!busy); } }}
    onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
    onDrop={(event) => { event.preventDefault(); event.stopPropagation(); setDragging(false); if (!busy) { checkFiles(Array.from(event.dataTransfer.files)); attachments.onDrop(event); } }}>
    {dragging ? <div className="production-composer-drop-hint" role="status">{tUi("Отпустите файлы — добавим к сообщению")}</div> : null}
      <ComposerMaterials mode={mode}>{materials}</ComposerMaterials>
      <div className="home-image-form-inner">
        <div className="home-image-prompt-area">
          <textarea ref={promptInput} autoFocus={autoFocus} disabled={inputDisabled} aria-label={inputLabel} placeholder={placeholder} value={value} rows={2}
            onChange={(event) => onChange(event.target.value)} onPaste={(event) => { if (!busy) attachments.onPaste(event); }}
            onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); onSubmit(); } }} />
          <div className="home-image-parameters">
            <button type="button" className="home-image-upload" aria-label={tUi("Загрузить материалы с устройства")} title={tUi("Изображения, текст, видео и аудио")} disabled={busy || !attachments.canAdd} onClick={() => uploadInput.current?.click()}><Plus size={16} /></button>
            <input {...attachments.inputProps} ref={uploadInput} hidden disabled={busy || !attachments.canAdd}
              onChange={(event) => { checkFiles(Array.from(event.currentTarget.files ?? [])); attachments.inputProps.onChange(event); }} />
            <div className="production-composer-parameters" key={`parameters-${mode}`}>{parameters}</div>
          </div>
        </div>
        <div className="home-image-tools" key={`tools-${mode}`}>{tools}</div>
      </div>
    </form>
  </div>
  </>;
}
