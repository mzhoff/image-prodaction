'use client';

import { Plus, Trash2, Upload } from 'lucide-react';
import { useRef } from 'react';
import type { ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { getNextPipelineTitle } from '@/entities/production-graph/model/graph-pipelines';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { readJsonFile } from '@/shared/lib/json-file';
import { ProTooltip } from '@/shared/ui/pro-tooltip';

export function PipelineSwitcher() {
  const router = useRouter();
  const activePipelineId = useProductionGraphStore((state) => state.activePipelineId);
  const pipelines = useProductionGraphStore((state) => state.pipelines);
  const createPipeline = useProductionGraphStore((state) => state.createPipeline);
  const deletePipeline = useProductionGraphStore((state) => state.deletePipeline);
  const importPipeline = useProductionGraphStore((state) => state.importPipeline);
  const switchPipeline = useProductionGraphStore((state) => state.switchPipeline);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const activePipeline = pipelines.find((pipeline) => pipeline.id === activePipelineId);

  const handleCreate = () => {
    const fallbackTitle = getNextPipelineTitle(pipelines);
    const title = window.prompt('Pipeline name', fallbackTitle);
    if (title === null) return;
    router.replace(getPipelineHref(createPipeline(title || fallbackTitle)), { scroll: false });
  };

  const handlePipelineChange = (pipelineId: string) => {
    switchPipeline(pipelineId);
    router.replace(getPipelineHref(pipelineId), { scroll: false });
  };

  const handleDelete = () => {
    if (!activePipeline) return;

    const confirmed = window.confirm(`Delete "${activePipeline.title}" pipeline?`);
    if (!confirmed) return;

    const result = deletePipeline(activePipeline.id);
    if (!result.ok) window.alert(result.reason);
    else router.replace(getPipelineHref(result.activePipelineId), { scroll: false });
  };

  const handleJsonFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    void importPipelineFile(file);
  };

  const importPipelineFile = async (file: File) => {
    try {
      const result = importPipeline(await readJsonFile(file), createPipelineTitleFromFileName(file.name));
      router.replace(getPipelineHref(result.id), { scroll: false });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Не удалось импортировать pipeline JSON.');
    }
  };

  return (
    <div className="pipeline-switcher" aria-label="Pipeline controls">
      <select
        aria-label="Active pipeline"
        className="pipeline-select"
        value={activePipelineId}
        onChange={(event) => handlePipelineChange(event.target.value)}
      >
        {pipelines.map((pipeline) => (
          <option key={pipeline.id} value={pipeline.id}>
            {pipeline.title}
          </option>
        ))}
      </select>
      <ProTooltip label="New pipeline" side="bottom">
        <button type="button" className="pipeline-icon-button" aria-label="New pipeline" onClick={handleCreate}>
          <Plus size={16} />
        </button>
      </ProTooltip>
      <ProTooltip label="Import pipeline" side="bottom">
        <button type="button" className="pipeline-icon-button" aria-label="Import pipeline" onClick={() => inputRef.current?.click()}>
          <Upload size={16} />
        </button>
      </ProTooltip>
      <ProTooltip label="Delete pipeline" side="bottom">
        <button
          type="button"
          className="pipeline-icon-button pipeline-icon-button-danger"
          aria-label="Delete pipeline"
          disabled={!activePipeline}
          onClick={handleDelete}
        >
          <Trash2 size={16} />
        </button>
      </ProTooltip>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={handleJsonFileChange}
      />
    </div>
  );
}

function getPipelineHref(pipelineId: string) {
  return pipelineId ? `/${pipelineId}` : '/';
}

function createPipelineTitleFromFileName(fileName: string) {
  return fileName
    .replace(/\.json$/i, '')
    .replace(/^reverie-(project|pipeline-template)-?/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Imported pipeline';
}
