'use client';
import { useUiCatalog } from '@/shared/i18n/use-ui-catalog';
import { useTranslations } from '@/shared/i18n/use-translations';

import { Image as ImageIcon, MessageSquare, Video } from '@prodactionpro/ui-core/icons';

export type HomeComposerMode = 'image' | 'video' | 'text';
const MODES = [
  { id: 'text', label: 'Текст', name: 'Текст', Icon: MessageSquare },
  { id: 'image', label: 'Фото', name: 'Изображение', Icon: ImageIcon },
  { id: 'video', label: 'Видео', name: 'Видео', Icon: Video },
] as const;

export function HomeComposerModeSwitch({ mode, onChange, disabled = false }: { mode: HomeComposerMode; onChange: (mode: HomeComposerMode) => void; disabled?: boolean }) {
  const tUi = useTranslations();
  const ui_MODES = useUiCatalog(MODES, tUi);
  return <div className="home-composer-modes" role="group" aria-label={tUi("Режим создания")}>
    {ui_MODES.map(({ id, label, name, Icon }) => <button key={id} type="button" aria-label={name} data-mode={id}
      aria-pressed={mode === id} disabled={disabled} onClick={() => {
        if (disabled || mode === id) return;
        onChange(id);
      }}><Icon size={18} /><span>{label}</span></button>)}
  </div>;
}
