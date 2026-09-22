'use client';
import { useTranslations } from '@/shared/i18n/use-translations';
import { useState, type ReactNode } from 'react';
import { Plus } from '@prodactionpro/ui-core/icons';
import { useWorkspaceShell } from '@/pages/workspace/ui/workspace-shell-context';
import { ProductionSectionLayout } from '@/shared/ui/production-section-layout';
import { DEFAULT_VIDEO_STYLE } from '@/shared/media/home-video-direction';
import { VideoStyleLibraryGrid } from '@/features/chat-assistant/ui/video-style-library-grid';
import { VideoStyleSaveDialog } from '@/features/chat-assistant/ui/video-style-save-dialog';

export function VideoStyleLibraryPage({ navigation }: { navigation: ReactNode }) {
  const tUi = useTranslations();
  const { activeWorkspace } = useWorkspaceShell();
  const [creating, setCreating] = useState(false);
  const [revision, setRevision] = useState(0);
  return <ProductionSectionLayout title="Library" className="library-section" navigation={navigation}
    actions={<button className="workspace-create-button" type="button" disabled={!activeWorkspace} onClick={() => setCreating(true)}><Plus size={16} />{tUi("Создать стиль")}</button>}>
    <div className="studio-organize-content">
      <p className="studio-hint">{tUi("Визуальный стиль, зерно и свободное описание. Применяйте их к истории, сцене или кадру.")}</p>
      {activeWorkspace ? <VideoStyleLibraryGrid key={activeWorkspace.id} workspaceId={activeWorkspace.id} revision={revision} /> : <p role="status">{tUi("Загружаем пространство…")}</p>}
    </div>
    {creating && activeWorkspace ? <VideoStyleSaveDialog key={activeWorkspace.id} workspaceId={activeWorkspace.id} value={DEFAULT_VIDEO_STYLE} editable
      onClose={() => setCreating(false)} onSaved={() => { setCreating(false); setRevision((value) => value + 1); }} /> : null}
  </ProductionSectionLayout>;
}
