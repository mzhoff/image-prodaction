'use client';
import { useTranslations } from '@/shared/i18n/use-translations';
import { useState } from 'react';
import { LibraryBig, Save } from '@prodactionpro/ui-core/icons';
import type { VideoStyleSettings } from '@/shared/media/home-video-direction';
import { VideoStyleSaveDialog } from './video-style-save-dialog';
import { VideoStyleDialog } from './video-style-dialog';
import { VideoStyleLibraryGrid } from './video-style-library-grid';
import styles from './video-style-library.module.css';

export function VideoStyleLibrary({ workspaceId, value, onChange, coverAssetId }: {
  workspaceId: string; value: VideoStyleSettings; onChange: (style: VideoStyleSettings, coverAssetId?: string) => void;
  coverAssetId?: string;
}) {
  const tUi = useTranslations();
  const [open, setOpen] = useState<'save' | 'library' | null>(null);
  const [message, setMessage] = useState('');
  return <div className={styles.actions}>
    <button type="button" className={styles.button} disabled={!workspaceId} onClick={() => { setMessage(''); setOpen('save'); }}><Save size={15} />{tUi("Сохранить стиль")}</button>
    <button type="button" className={styles.button} disabled={!workspaceId} onClick={() => setOpen('library')}><LibraryBig size={15} />{tUi("Стили из Library")}</button>
    {message ? <span role="status" className={styles.hint}>{message}</span> : null}
    {open === 'save' ? <VideoStyleSaveDialog workspaceId={workspaceId} value={value} coverAssetId={coverAssetId} onClose={() => setOpen(null)}
      onSaved={(saved) => { onChange(saved.style, saved.coverAssetId ?? undefined); setMessage(tUi("Стиль сохранён в Library")); setOpen(null); }} /> : null}
    {open === 'library' ? <VideoStyleDialog title={tUi("Стили из Library")} onClose={() => setOpen(null)}>
      <p className={styles.hint}>{tUi("Выбранный стиль заменит стиль, зерно и описание этого уровня. Остальные настройки сохранятся.")}</p>
      <VideoStyleLibraryGrid workspaceId={workspaceId} onChoose={(preset) => { onChange(preset.style, preset.coverAssetId ?? undefined); setOpen(null); }} />
    </VideoStyleDialog> : null}
  </div>;
}
