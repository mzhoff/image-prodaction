'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Plus, Trash2, Upload } from 'lucide-react';
import { useRef } from 'react';
import type { ChangeEvent } from 'react';
import { AuthPanel } from '@/features/auth/ui/auth-panel';
import { PipelineSyncStatus } from '@/widgets/production-canvas/ui/pipeline-sync-status';
import {
  createPipelineOnBackend,
  deletePipelineFromBackend,
  importPipelineOnBackend,
  usePipelineBackendSync,
} from '@/entities/production-graph/model/use-pipeline-backend-sync';
import { useProductionGraphHydrated } from '@/entities/production-graph/model/use-production-graph-hydrated';
import { getNextPipelineTitle } from '@/entities/production-graph/model/graph-pipelines';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { readJsonFile } from '@/shared/lib/json-file';
import { ProTooltip } from '@/shared/ui/pro-tooltip';

export function PipelineIndexPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  usePipelineBackendSync();
  const hydrated = useProductionGraphHydrated();
  const pipelines = useProductionGraphStore((state) => state.pipelines);
  const deletePipelineAction = useProductionGraphStore((state) => state.deletePipeline);

  const handleCreate = () => {
    const fallbackTitle = getNextPipelineTitle(pipelines);
    const title = window.prompt('Pipeline name', fallbackTitle);
    if (title === null) return;

    void createPipeline(title || fallbackTitle);
  };

  const createPipeline = async (title: string) => {
    try {
      const pipelineId = await createPipelineOnBackend(title);
      router.replace(getPipelineHref(pipelineId));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Не удалось создать pipeline.');
    }
  };

  const handleDelete = (pipelineId: string, title: string) => {
    if (!window.confirm(`Delete "${title}" pipeline?`)) return;
    void deletePipeline(pipelineId);
  };

  const deletePipeline = async (pipelineId: string) => {
    try {
      await deletePipelineFromBackend(pipelineId);
      const result = deletePipelineAction(pipelineId);
      if (!result.ok) window.alert(result.reason);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Не удалось удалить pipeline.');
    }
  };

  const handleJsonFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    void importPipelineFile(file);
  };

  const importPipelineFile = async (file: File) => {
    try {
      const result = await importPipelineOnBackend(await readJsonFile(file), createPipelineTitleFromFileName(file.name));
      router.replace(getPipelineHref(result.id));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Не удалось импортировать pipeline JSON.');
    }
  };

  return (
    <main className="pipeline-index-page">
      <header className="pipeline-index-header">
        <div className="editor-brand">
          <span className="editor-brand-mark">R</span>
          <div>
            <h1>Reverie Image Production</h1>
            <p>Backend pipelines</p>
          </div>
        </div>
        <div className="pipeline-index-header-actions">
          <PipelineSyncStatus />
          <AuthPanel />
        </div>
      </header>
      <section className="pipeline-index-body">
        <div className="pipeline-index-heading">
          <div>
            <h2>Pipelines</h2>
            <p>Choose a saved pipeline or create a new one.</p>
          </div>
          <div className="pipeline-index-actions">
            <button type="button" className="pipeline-index-action" disabled={!hydrated} onClick={handleCreate}>
              <Plus size={16} />
              <span>New</span>
            </button>
            <button type="button" className="pipeline-index-action" disabled={!hydrated} onClick={() => inputRef.current?.click()}>
              <Upload size={16} />
              <span>Import</span>
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={handleJsonFileChange}
            />
          </div>
        </div>
        {!hydrated ? (
          <div className="pipeline-index-loading" aria-hidden="true" />
        ) : pipelines.length === 0 ? (
          <div className="pipeline-empty-state">
            <h3>No pipelines yet</h3>
            <p>Create or import a pipeline to start.</p>
          </div>
        ) : (
          <div className="pipeline-list">
            {pipelines.map((pipeline) => (
              <article key={pipeline.id} className="pipeline-list-item">
                <Link href={getPipelineHref(pipeline.id)} className="pipeline-list-link">
                  <span className="pipeline-list-title">{pipeline.title}</span>
                  <span className="pipeline-list-meta">
                    {pipeline.project.nodes.length} nodes / {pipeline.project.assets.length} assets
                  </span>
                </Link>
                <div className="pipeline-list-actions">
                  <Link href={getPipelineHref(pipeline.id)} className="pipeline-open-link" aria-label={`Open ${pipeline.title}`}>
                    <ArrowRight size={16} />
                  </Link>
                  <ProTooltip label="Delete pipeline" side="bottom">
                    <button
                      type="button"
                      className="pipeline-delete-button"
                      aria-label={`Delete ${pipeline.title}`}
                      onClick={() => handleDelete(pipeline.id, pipeline.title)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </ProTooltip>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function getPipelineHref(pipelineId: string) {
  return `/${pipelineId}`;
}

function createPipelineTitleFromFileName(fileName: string) {
  return fileName
    .replace(/\.json$/i, '')
    .replace(/^reverie-(project|pipeline-template)-?/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Imported pipeline';
}
