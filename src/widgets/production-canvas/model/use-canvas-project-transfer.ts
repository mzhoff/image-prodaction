import { useCallback } from 'react';
import type { GraphPoint } from '@/entities/production-graph/model/types';
import type { PortableProjectExport } from '@/entities/production-graph/model/project-schema';
import type { ProductionGraphState } from '@/entities/production-graph/model/store-types';
import { createDatedJsonFileName, downloadJsonFile, readJsonFile } from '@/shared/lib/json-file';

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
  const exportProjectSnapshotFile = useCallback(() => {
    downloadJsonFile(exportProjectSnapshot(), createDatedJsonFileName('reverie-project'));
    showToast('Project snapshot exported.');
  }, [exportProjectSnapshot, showToast]);

  const exportSectionPipelineTemplateFile = useCallback((sectionId: string, sectionTitle: string) => {
    const fileNamePrefix = `reverie-pipeline-${slugifyFilePrefix(sectionTitle) || 'section'}`;
    downloadJsonFile(exportPipelineTemplateForSection(sectionId), createDatedJsonFileName(fileNamePrefix));
    showToast('Pipeline template exported.');
  }, [exportPipelineTemplateForSection, showToast]);

  const importPortableProjectFile = useCallback(async (file: File, expectedKind: PortableProjectExport['kind']) => {
    try {
      const result = importPortableProject(await readJsonFile(file), expectedKind);
      showToast(result.kind === 'pipelineTemplate' ? 'Pipeline template imported.' : 'Project snapshot imported.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не удалось импортировать JSON.');
    }
  }, [importPortableProject, showToast]);

  const importProjectSnapshotFile = useCallback((file: File) => {
    void importPortableProjectFile(file, 'projectSnapshot');
  }, [importPortableProjectFile]);

  const importPipelineTemplateFileAt = useCallback(async (file: File, position: GraphPoint) => {
    try {
      const result = importPipelineTemplateAt(await readJsonFile(file), position);
      showToast(result.nodeCount > 0 ? `Pipeline imported: ${result.nodeCount} nodes.` : 'Pipeline JSON is empty.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не удалось импортировать pipeline JSON.');
    }
  }, [importPipelineTemplateAt, showToast]);

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
