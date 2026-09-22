'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Brush, Download, ImagePlus, Library, LoaderCircle, Maximize2 } from '@prodactionpro/ui-core/icons';
import { useEffect, useRef, useState } from 'react';
import { ProTooltip } from '@/shared/ui/pro-tooltip';
import { downloadHomeResult, readHomeResultImage, readHomeResultReference, type HomeResultImage, type HomeEditSelectionHandler } from '../api/home-result-media-api';
import styles from './home-result-media.module.css';

const HomeResultViewer = dynamic(() => import('./home-result-viewer').then((module) => module.HomeResultViewer), { ssr: false });

export function HomeResultMedia({ assetId, workspaceId, onUseReference, onEditSelection }: {
  assetId: string; workspaceId: string; onUseReference: (file: File) => Promise<void>;
  onEditSelection?: HomeEditSelectionHandler;
}) {
  const tUi = useTranslations();
  const [viewer, setViewer] = useState<{ image: HomeResultImage; edit: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  const run = async (action: (signal: AbortSignal) => Promise<void>) => {
    if (active.current) return false;
    const controller = new AbortController(); active.current = controller; setBusy(true); setError('');
    try { await action(controller.signal); return !controller.signal.aborted; }
    catch (caught) { if (!controller.signal.aborted) setError(caught instanceof Error && /[а-яё]/i.test(caught.message)
      ? caught.message : tUi("Не удалось открыть изображение. Попробуйте ещё раз.")); return false; }
    finally { if (active.current === controller) { active.current = null; setBusy(false); } }
  };
  const open = (edit: boolean) => run(async (signal) => {
    const image = await readHomeResultImage(assetId, workspaceId, signal);
    if (!signal.aborted) setViewer({ image, edit });
  });
  const download = () => run((signal) => downloadHomeResult(assetId, workspaceId, signal));
  const addReference = () => run(async (signal) => {
    const file = await readHomeResultReference(assetId, workspaceId, signal);
    if (!signal.aborted) await onUseReference(file);
  });
  const close = () => setViewer(null);
  const contentUrl = `/api/assets/${encodeURIComponent(assetId)}/content`;
  return <div className={styles.media}>
    <button type="button" className={styles.preview} disabled={busy} onClick={() => void open(false)} aria-label={tUi("Открыть изображение на весь экран")}>
      <img src={contentUrl} alt={tUi("Результат генерации")} draggable={false} />
    </button>
    <div className={styles.toolbar} role="group" aria-label={tUi("Действия с изображением")}>
      <ProTooltip label={tUi("Скачать")} side="bottom"><button type="button" className={styles.action} aria-label={tUi("Скачать изображение")} disabled={busy} onClick={() => void download()}><Download size={18} /></button></ProTooltip>
      <ProTooltip label={tUi("На весь экран")} side="bottom"><button type="button" className={styles.action} aria-label={tUi("Открыть на весь экран")} disabled={busy} onClick={() => void open(false)}><Maximize2 size={18} /></button></ProTooltip>
      {onEditSelection ? <ProTooltip label={tUi("Выделить область")} side="bottom"><button type="button" className={styles.action} aria-label={tUi("Выделить область для правки")} disabled={busy} onClick={() => void open(true)}><Brush size={18} /></button></ProTooltip> : null}
      <ProTooltip label={tUi("Как референс")} side="bottom"><button type="button" className={styles.action} aria-label={tUi("Использовать как референс")} disabled={busy} onClick={() => void addReference()}><ImagePlus size={18} /></button></ProTooltip>
      <ProTooltip label={tUi("В библиотеку")} side="bottom"><Link className={styles.action} href="/library" aria-label={tUi("Открыть Library")}><Library size={18} /></Link></ProTooltip>
    </div>
    {busy ? <span className={styles.busy} role="status"><LoaderCircle size={17} className="home-generation-spinner" /><span className={styles.srOnly}>{tUi("Подготавливаю изображение…")}</span></span> : null}
    {error ? <p className={styles.error} role="alert">{typeof (error) === 'string' ? tUi((error) as string) : (error)}</p> : null}
    {viewer ? <HomeResultViewer image={viewer.image} initialMaskOpen={viewer.edit}
      onClose={close} onEditSelection={onEditSelection} onDownload={download} onUseReference={addReference} busy={busy} actionError={typeof (error) === 'string' ? tUi((error) as string) : (error)} /> : null}
  </div>;
}
