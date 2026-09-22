'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import Image from 'next/image';
import { useEffect, useId, useRef, useState } from 'react';
import { Download, ImagePlus, LoaderCircle, X } from '@prodactionpro/ui-core/icons';
import { MediaViewer } from '@prodactionpro/ui-media/client';
import type { MediaImageProps } from '@prodactionpro/ui-media';
import { useImageViewerMaskModule } from '@/features/graph-node/ui/use-image-viewer-mask-module';
import { hasOpenFloatingContextMenu } from '@/shared/ui/floating-context-menu';
import { dataUrlToFile } from '@/shared/lib/image-data-url';
import { loadHomeLibraryReferenceFile } from '../api/home-library-reference-api';
import { createHomeMaskPrompt, type HomeResultImage, type HomeEditSelectionHandler } from '../api/home-result-media-api';
import styles from './home-result-media.module.css';

export function HomeResultViewer({ image, initialMaskOpen, onClose, onEditSelection, onDownload, onUseReference, busy, actionError }: {
  image: HomeResultImage; initialMaskOpen: boolean; onClose: () => void;
  onEditSelection?: HomeEditSelectionHandler; onDownload: () => Promise<boolean>; onUseReference: () => Promise<boolean>; busy: boolean; actionError: string;
}) {
  const tUi = useTranslations();
  const [maskDataUrl, setMaskDataUrl] = useState<string | null>(null);
  const [instruction, setInstruction] = useState('');
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState('');
  const active = useRef<AbortController | null>(null);
  const instructionId = useId();
  useEffect(() => () => active.current?.abort(), []);
  const mask = useImageViewerMaskModule({ assetId: image.id, width: image.width, height: image.height,
    initialMaskOpen, maskDataUrl: maskDataUrl ?? undefined, busy: preparing,
    onMaskChange: onEditSelection ? setMaskDataUrl : undefined });
  const applyMask = async () => {
    if (!onEditSelection || active.current) return;
    if (!maskDataUrl) { setError(tUi("Сначала выделите область на изображении.")); return; }
    if (!instruction.trim()) { setError(tUi("Напишите, что нужно изменить в выделенной области.")); return; }
    const controller = new AbortController(); active.current = controller; setPreparing(true); setError('');
    try {
      const [source, maskFile] = await Promise.all([
        loadHomeLibraryReferenceFile(image, controller.signal), dataUrlToFile(maskDataUrl, `mask-${image.id}.png`),
      ]);
      if (controller.signal.aborted) return;
      await onEditSelection([source, maskFile], createHomeMaskPrompt(instruction));
      if (!controller.signal.aborted) onClose();
    } catch (caught) { if (!controller.signal.aborted) setError(caught instanceof Error && /[а-яё]/i.test(caught.message)
      ? caught.message : tUi("Не удалось подготовить правку. Попробуйте ещё раз.")); }
    finally { if (active.current === controller) { active.current = null; setPreparing(false); } }
  };
  const maskModule = mask.module ? { ...mask.module, label: tUi("Выделить область"), body: mask.maskOpen ? <div className={styles.editPanel}>
    <label htmlFor={instructionId}>{tUi("Что изменить в выделенной области?")}</label>
    <textarea id={instructionId} value={instruction} onChange={(event) => setInstruction(event.target.value)} disabled={preparing}
      placeholder={tUi("Например: заменить фон на вечерний город")} rows={2} />
    <div className={styles.editFooter}><p>{tUi("Исходник и маска станут референсами. Проверьте запрос и нажмите «Создать» в Home.")}</p>
      <button type="button" className={styles.useMask} disabled={preparing || busy} onClick={() => void applyMask()}>
        {preparing ? <LoaderCircle size={16} className="home-generation-spinner" /> : <ImagePlus size={16} />}{tUi("Использовать маску")}</button></div>
    {error ? <p className={styles.error} role="alert">{typeof (error) === 'string' ? tUi((error) as string) : (error)}</p> : null}
  </div> : undefined } : undefined;
  const contentUrl = `/api/assets/${encodeURIComponent(image.id)}/content`;
  return <MediaViewer items={[{ id: image.id, url: contentUrl, width: image.width, height: image.height, kind: 'image', name: image.originalName }]}
    selectedId={image.id} onSelect={() => undefined} onClose={onClose} label={tUi("Просмотр результата генерации")}
    labels={{ close: tUi("Закрыть изображение") }} icons={{ close: <X size={20} /> }} renderImage={renderImage}
    isInteractionBlocked={hasOpenFloatingContextMenu} modules={maskModule ? [maskModule] : []}
    className={mask.maskOpen ? 'image-viewer-overlay-editing' : undefined}
    metadata={<><span>{image.width} × {image.height} px</span>{actionError ? <span role="alert">{typeof (actionError) === 'string' ? tUi((actionError) as string) : (actionError)}</span> : null}</>}
    actions={<div className={styles.viewerActions}>
      <button type="button" aria-label={tUi("Скачать изображение")} title={tUi("Скачать")} disabled={busy || preparing} onClick={() => void onDownload()}><Download size={18} /></button>
      <button type="button" aria-label={tUi("Использовать как референс")} title={tUi("Как референс")} disabled={busy || preparing}
        onClick={() => void onUseReference().then((success) => { if (success) onClose(); })}><ImagePlus size={18} /></button>
    </div>} />;
}

function renderImage(props: MediaImageProps) { return <Image {...props} alt={props.alt} unoptimized draggable={false} />; }
