'use client';
import { useTranslations } from '@/shared/i18n/use-translations';
import { useCallback } from 'react';
import type { GraphPoint } from '@/entities/production-graph/model/types';
import type { PortableProjectExport } from '@/entities/production-graph/model/project-schema';
import type { ProductionGraphState } from '@/entities/production-graph/model/store-types';
import { createDatedJsonFileName, downloadJsonFile, readJsonFile } from '@/shared/lib/json-file';
import { trackBehavior } from '@/shared/analytics/client';

interface UseCanvasProjectTransferOptions {
  exportPipelineTemplateForSection: ProductionGraphState['exportPipelineTemplateForSection'];
  exportProjectSnapshot: ProductionGraphState['exportProjectSnapshot'];
  importPipelineTemplateAt: ProductionGraphState['importPipelineTemplateAt'];
  importPortableProject: ProductionGraphState['importPortableProject'];
  showToast: (message: string) => void;
}

export function useCanvasProjectTransfer({
  exportPipelineTemplateForSection,
  exportProjectSnapshot,
  importPipelineTemplateAt,
  importPortableProject,
  showToast,
}: UseCanvasProjectTransferOptions) {
  const tUi = useTranslations();
  const exportProjectSnapshotFile = useCallback(() => {
    downloadJsonFile(exportProjectSnapshot(), createDatedJsonFileName('reverie-project'));
    trackBehavior('ip_document_exported', { source: 'editor', operation: 'project_snapshot' });
    showToast('Project snapshot exported.');
  }, [exportProjectSnapshot, showToast]);

  const exportSectionPipelineTemplateFile = useCallback((sectionId: string, sectionTitle: string) => {
    const fileNamePrefix = `reverie-pipeline-${slugifyFilePrefix(sectionTitle) || 'section'}`;
    downloadJsonFile(exportPipelineTemplateForSection(sectionId), createDatedJsonFileName(fileNamePrefix));
    trackBehavior('ip_document_exported', { source: 'editor', operation: 'pipeline_template' });
    showToast('Pipeline template exported.');
  }, [exportPipelineTemplateForSection, showToast]);

  const importPortableProjectFile = useCallback(async (file: File, expectedKind: PortableProjectExport['kind']) => {
    try {
      const result = importPortableProject(await readJsonFile(file), expectedKind);
      trackBehavior('ip_document_imported', { source: 'editor', operation: result.kind === 'pipelineTemplate' ? 'pipeline_template' : 'project_snapshot' });
      showToast(result.kind === 'pipelineTemplate' ? 'Pipeline template imported.' : 'Project snapshot imported.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : tUi("Не удалось импортировать JSON."));
    }
  }, [tUi, importPortableProject, showToast]);

  const importProjectSnapshotFile = useCallback((file: File) => {
    void importPortableProjectFile(file, 'projectSnapshot');
  }, [importPortableProjectFile]);

  const importPipelineTemplateFileAt = useCallback(async (file: File, position: GraphPoint) => {
    try {
      const result = importPipelineTemplateAt(await readJsonFile(file), position);
      if (result.nodeCount > 0) trackBehavior('ip_document_imported', { source: 'editor', operation: 'pipeline_template' });
      showToast(result.nodeCount > 0 ? `Pipeline imported: ${result.nodeCount} nodes.` : 'Pipeline JSON is empty.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : tUi("Не удалось импортировать pipeline JSON."));
    }
  }, [tUi, importPipelineTemplateAt, showToast]);

  const importPipelineTemplateAtPosition = useCallback((position: GraphPoint) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.hidden = true;
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.remove();
      if (file) void importPipelineTemplateFileAt(file, position);
    }, { once: true });
    document.body.appendChild(input);
    input.click();
  }, [importPipelineTemplateFileAt]);

  return {
    exportSectionPipelineTemplate: exportSectionPipelineTemplateFile,
    exportProjectSnapshot: exportProjectSnapshotFile,
    importPipelineTemplateAt: importPipelineTemplateAtPosition,
    importProjectSnapshotFile,
  };
}

function slugifyFilePrefix(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}
