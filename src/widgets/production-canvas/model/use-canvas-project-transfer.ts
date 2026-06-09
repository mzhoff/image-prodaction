import { useCallback } from 'react';
import type { PortableProjectExport } from '@/entities/production-graph/model/project-schema';
import type { ProductionGraphState } from '@/entities/production-graph/model/store-types';
import { createDatedJsonFileName, downloadJsonFile, readJsonFile } from '@/shared/lib/json-file';

interface UseCanvasProjectTransferOptions {
  exportPipelineTemplate: ProductionGraphState['exportPipelineTemplate'];
  exportProjectSnapshot: ProductionGraphState['exportProjectSnapshot'];
  importPortableProject: ProductionGraphState['importPortableProject'];
  showToast: (message: string) => void;
}

export function useCanvasProjectTransfer({
  exportPipelineTemplate,
  exportProjectSnapshot,
  importPortableProject,
  showToast,
}: UseCanvasProjectTransferOptions) {
  const exportProjectSnapshotFile = useCallback(() => {
    downloadJsonFile(exportProjectSnapshot(), createDatedJsonFileName('reverie-project'));
    showToast('Project snapshot exported.');
  }, [exportProjectSnapshot, showToast]);

  const exportPipelineTemplateFile = useCallback(() => {
    downloadJsonFile(exportPipelineTemplate(), createDatedJsonFileName('reverie-pipeline-template'));
    showToast('Pipeline template exported.');
  }, [exportPipelineTemplate, showToast]);

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

  const importPipelineTemplateFile = useCallback((file: File) => {
    void importPortableProjectFile(file, 'pipelineTemplate');
  }, [importPortableProjectFile]);

  return {
    exportPipelineTemplate: exportPipelineTemplateFile,
    exportProjectSnapshot: exportProjectSnapshotFile,
    importPipelineTemplateFile,
    importProjectSnapshotFile,
  };
}
