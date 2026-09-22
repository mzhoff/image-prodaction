'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@prodactionpro/ui-core/button';
import { Check } from '@prodactionpro/ui-core/icons';
import { StoriesEditor } from '@prodactionpro/ui-stories-editor/client';
import type { EditorMedia, StoryDocumentDraftV1 } from '@prodactionpro/ui-stories-editor';
import '@prodactionpro/ui-stories-editor/styles.css';
import { getStoriesAuthoringActions, type StoriesAuthoringProfileBundle } from '@/shared/contracts/stories-authoring-profile';
import './reverie-stories-editor.css';

interface Props {
  initialDocument: StoryDocumentDraftV1;
  media: EditorMedia[];
  onSave: (document: StoryDocumentDraftV1) => void;
  fromConnectedRecipe?: boolean;
  authoringProfileBundle?: StoriesAuthoringProfileBundle;
  onClose: () => void;
}

/** The product adapter owns save/cancel and history; the shared editor owns structure. */
export function ReverieStoriesEditor({ initialDocument, media, onSave, onClose, fromConnectedRecipe = false, authoringProfileBundle }: Props) {
  const tUi = useTranslations();
  const dialog = useRef<HTMLDialogElement>(null);
  const [history, setHistory] = useState({ documents: [initialDocument], index: 0 });
  const draft = history.documents[history.index];
  const [saveError, setSaveError] = useState('');
  useEffect(() => {
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element?.showModal();
    element?.querySelector<HTMLElement>('button[aria-pressed="true"]')?.focus({ preventScroll: true });
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);
  return createPortal(
    <dialog ref={dialog} className="reverie-stories-editor-dialog" aria-label={tUi("Редактор REVERIE Stories")} data-node-interactive
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLowerCase() !== 'z') return;
        if ((event.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')) return;
        event.preventDefault();
        setHistory((current) => ({ ...current, index: Math.max(0, Math.min(current.documents.length - 1, current.index + (event.shiftKey ? 1 : -1))) }));
      }}>
      <div className="reverie-stories-editor-layout">
        <div className="reverie-stories-editor-workspace">
          <StoriesEditor document={draft} media={media} styleProfile={authoringProfileBundle?.styleProfile} styleOverrides={authoringProfileBundle?.hostProfile.styleOverrides}
            actions={authoringProfileBundle ? getStoriesAuthoringActions(authoringProfileBundle) : undefined} onClose={onClose}
            onChange={(document) => setHistory((current) => ({ documents: [...current.documents.slice(0, current.index + 1), document], index: current.index + 1 }))}
            history={{ canUndo: history.index > 0, canRedo: history.index < history.documents.length - 1,
              onUndo: () => setHistory((current) => ({ ...current, index: Math.max(0, current.index - 1) })),
              onRedo: () => setHistory((current) => ({ ...current, index: Math.min(current.documents.length - 1, current.index + 1) })) }} />
        </div>
        <footer className="reverie-stories-editor-footer">
          <div className="reverie-stories-editor-notes">
            {saveError ? <p role="alert" className="reverie-stories-editor-error">{typeof (saveError) === 'string' ? tUi((saveError) as string) : (saveError)}</p> : null}
            <p>{fromConnectedRecipe ? tUi("Правки сохраняются в черновике. Новый запуск Pipeline соберёт историю из входов.") : tUi("Черновик сохраняется в Pipeline. Публикация Stories — в Content Hub.")}</p>
            {!authoringProfileBundle ? <p>{tUi("Для точного предпросмотра и кнопок загрузите стиль приложения в ноде.")}</p> : null}
          </div>
          <div className="reverie-stories-editor-actions">
            <Button type="button" appearance="outline" intent="neutral" size="md" onClick={onClose}>{tUi("Отмена")}</Button>
            <Button type="button" intent="neutral" size="md" leadingIcon={<Check size={16} />} onClick={() => { try { onSave(draft); } catch (error) { setSaveError(error instanceof Error ? error.message : tUi("Не удалось сохранить черновик.")); } }}>{tUi("Сохранить черновик")}</Button>
          </div>
        </footer>
      </div>
    </dialog>, document.body,
  );
}
