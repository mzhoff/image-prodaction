'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { Copy, Download, Link2, Lock, Palette, Pencil, PlayCircle, Trash2, Unlock } from '@prodactionpro/ui-core/icons';
import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { GraphSection } from '@/entities/production-graph/model/types';
import type { ContextMenuAction } from '@/shared/ui/context-menu-types';
import type { useStudioPipelinePublications } from '@/modules/executable-pipelines/adapters/studio/use-studio-pipeline-publications';
import type { useProductionCanvasStore } from './use-production-canvas-store';

export interface SectionMenuOptions {
  exportSectionPipelineTemplate: (sectionId: string, title: string) => void;
  graph: ReturnType<typeof useProductionCanvasStore>;
  projectId?: string;
  sectionColorPreviews: Record<string, string>;
  setSectionColorPreviews: Dispatch<SetStateAction<Record<string, string>>>;
  showToast: (message: string) => void;
  studioPipelines: ReturnType<typeof useStudioPipelinePublications>;
}

export function useSectionMenuActions({ exportSectionPipelineTemplate, graph, projectId,
  sectionColorPreviews, setSectionColorPreviews, showToast, studioPipelines }: SectionMenuOptions) {
  const tUi = useTranslations();
  return useCallback((section: GraphSection): ContextMenuAction[] => {
    const publication = studioPipelines.publicationsBySectionId.get(section.id);
    const publishing = studioPipelines.publishingSectionIds.has(section.id);
    return [
      {
        id: 'make-section-executable',
        label: publication ? 'Publish executable version' : 'Make executable',
        icon: <PlayCircle size={14} />, disabled: publishing || !projectId,
        onSelect: () => { void studioPipelines.publishSection(section.id)
          .then((next) => showToast(`Executable pipeline published: v${next.version}.`))
          .catch((error) => showToast(error instanceof Error
            ? error.message : 'Could not publish executable pipeline.')); },
      },
      { id: 'export-section-pipeline', label: 'Export Pipeline', icon: <Download size={14} />,
        separatorBefore: true,
        onSelect: () => exportSectionPipelineTemplate(section.id, section.title) },
      { id: 'rename-section', label: 'Rename group', icon: <Pencil size={14} />,
        onSelect: () => { const title = window.prompt('Group name', section.title);
          if (title) graph.renameSection(section.id, title); } },
      { id: 'section-capability', label: 'Integration capability', icon: <Link2 size={14} />,
        onSelect: () => {
          const value = window.prompt(tUi("Назначение pipeline, например content.generate-article-summary. Пустое значение удалит назначение из черновика. Затем опубликуйте новую executable version."), section.capabilityKey ?? '');
          if (value === null) return;
          const result = graph.setSectionCapabilityKey(section.id, value);
          showToast(result.ok
            ? tUi("Назначение обновлено в черновике. Выберите Publish executable version, чтобы применить его в новой публикации.")
            : result.reason);
        } },
      { id: 'duplicate-section', label: 'Duplicate group', icon: <Copy size={14} />,
        onSelect: () => graph.duplicateSection(section.id) },
      { id: 'section-color', kind: 'color', label: 'Background', icon: <Palette size={14} />,
        value: sectionColorPreviews[section.id] ?? section.color ?? '#d9d9d9',
        onPreview: (color) => setSectionColorPreviews((current) => ({
          ...current, [section.id]: color,
        })),
        onCommit: (color) => { setSectionColorPreviews((current) => {
          const { [section.id]: _preview, ...next } = current; return next;
        }); graph.setSectionColor(section.id, color); } },
      { id: 'toggle-section-lock', label: section.locked ? 'Unlock group' : 'Lock group',
        icon: section.locked ? <Unlock size={14} /> : <Lock size={14} />,
        separatorBefore: true, onSelect: () => graph.toggleSectionLock(section.id) },
      { id: 'delete-section', label: 'Delete group', icon: <Trash2 size={14} />,
        destructive: true, separatorBefore: true,
        onSelect: () => graph.deleteSection(section.id) },
    ];
  }, [tUi, exportSectionPipelineTemplate, graph, projectId, sectionColorPreviews,
    setSectionColorPreviews, showToast, studioPipelines]);

}
