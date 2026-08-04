'use client';

import Link from 'next/link';
import { Check, Copy, ExternalLink, Route, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ExecutablePipelineCatalogItem } from '@/modules/executable-pipelines/contracts/pipeline-catalog-contracts';
import type { PipelineValueKind } from '@/modules/executable-pipelines/contracts/pipeline-contracts';
import type { StudioPipelineBoundary } from '@/modules/executable-pipelines/contracts/pipeline-publication-contracts';
import { useWorkspacePipelines } from '../model/use-workspace-pipelines';

interface ExecutablePipelinesSectionProps {
  workspaceId?: string;
}

const integerFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export function ExecutablePipelinesSection({ workspaceId }: ExecutablePipelinesSectionProps) {
  const catalog = useWorkspacePipelines(workspaceId);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedEndpoint, setCopiedEndpoint] = useState<string | null>(null);
  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visiblePipelines = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return catalog.pipelines;
    return catalog.pipelines.filter((pipeline) => [
      pipeline.name,
      pipeline.originDocumentName,
      pipeline.endpointPublicId,
      ...pipeline.inputs.map((boundary) => boundary.nodeTitle),
      ...pipeline.outputs.map((boundary) => boundary.nodeTitle),
    ].some((value) => value?.toLowerCase().includes(query)));
  }, [catalog.pipelines, searchQuery]);

  useEffect(() => () => {
    if (copyResetTimerRef.current) clearTimeout(copyResetTimerRef.current);
  }, []);

  const copyEndpoint = async (endpointPublicId: string) => {
    try {
      await copyTextToClipboard(endpointPublicId);
      setCopiedEndpoint(endpointPublicId);
      if (copyResetTimerRef.current) clearTimeout(copyResetTimerRef.current);
      copyResetTimerRef.current = setTimeout(() => setCopiedEndpoint(null), 1800);
    } catch {
      setCopiedEndpoint(null);
    }
  };

  return (
    <div className="workspace-content workspace-pipelines-content">
      <section className="workspace-pipelines-section" aria-labelledby="workspace-pipelines-title">
        <div className="workspace-pipelines-header">
          <div>
            <h2 id="workspace-pipelines-title">Executable Pipelines</h2>
            <p>Published server pipelines available in this workspace.</p>
          </div>
          <label className="workspace-search workspace-pipelines-search">
            <Search size={16} />
            <input
              aria-label="Search executable pipelines"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search pipelines"
              type="search"
              value={searchQuery}
            />
          </label>
        </div>

        {catalog.error ? <p className="workspace-pipelines-error" role="alert">{catalog.error}</p> : null}

        {catalog.loading ? (
          <div className="workspace-pipelines-loading" role="status">Loading executable pipelines…</div>
        ) : null}

        {!catalog.loading && visiblePipelines.length > 0 ? (
          <div className="workspace-pipeline-table-shell">
            <table className="workspace-pipeline-table">
              <thead>
                <tr>
                  <th scope="col">Pipeline</th>
                  <th scope="col">Input</th>
                  <th scope="col">Output</th>
                  <th scope="col">Endpoint</th>
                  <th className="workspace-pipeline-number-column" scope="col">Invocations</th>
                  <th className="workspace-pipeline-number-column" scope="col">Total tokens</th>
                  <th className="workspace-pipeline-number-column" scope="col">Average cost</th>
                </tr>
              </thead>
              <tbody>
                {visiblePipelines.map((pipeline) => (
                  <PipelineTableRow
                    copied={copiedEndpoint === pipeline.endpointPublicId}
                    key={pipeline.pipelineId}
                    onCopy={copyEndpoint}
                    pipeline={pipeline}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {!catalog.loading && visiblePipelines.length === 0 ? (
          <div className="workspace-pipelines-empty">
            <Route size={28} />
            <strong>{catalog.pipelines.length === 0 ? 'No executable pipelines yet' : 'No matching pipelines'}</strong>
            <span>
              {catalog.pipelines.length === 0
                ? 'Open a document, right-click a section and choose Make executable.'
                : 'Try another search query.'}
            </span>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function PipelineTableRow({
  copied,
  onCopy,
  pipeline,
}: {
  copied: boolean;
  onCopy: (endpointPublicId: string) => Promise<void>;
  pipeline: ExecutablePipelineCatalogItem;
}) {
  return (
    <tr className="workspace-pipeline-row">
      <td className="workspace-pipeline-name-cell">
        <div className="workspace-pipeline-name-row">
          <h3>{pipeline.name}</h3>
          <span className="workspace-pipeline-status">
            <Route size={12} />
            Executable · v{pipeline.version}
          </span>
        </div>
        <div className="workspace-pipeline-source">
          {pipeline.originDocumentId ? (
            <Link href={`/projects/${pipeline.originDocumentId}`}>
              {pipeline.originDocumentName ?? 'Open source document'}
              <ExternalLink size={11} />
            </Link>
          ) : <span>Source document unavailable</span>}
          <time dateTime={pipeline.publishedAt}>{formatPublishedAt(pipeline.publishedAt)}</time>
        </div>
      </td>
      <td><BoundaryList boundaries={pipeline.inputs} direction="Input" /></td>
      <td><BoundaryList boundaries={pipeline.outputs} direction="Output" /></td>
      <td>
        <div className="workspace-pipeline-endpoint">
          <code title={pipeline.endpointPublicId}>{pipeline.endpointPublicId}</code>
          <button
            aria-label={copied
              ? `Copied endpoint ${pipeline.endpointPublicId}`
              : `Copy endpoint ${pipeline.endpointPublicId}`}
            onClick={() => void onCopy(pipeline.endpointPublicId)}
            title={copied ? 'Copied' : 'Copy endpoint ID'}
            type="button"
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
          </button>
        </div>
      </td>
      <td className="workspace-pipeline-metric">{integerFormatter.format(pipeline.stats.invocationCount)}</td>
      <td className="workspace-pipeline-metric">{formatIntegerString(pipeline.stats.totalTokens)}</td>
      <td className="workspace-pipeline-metric">{formatUsd(pipeline.stats.averageCostUsd)}</td>
    </tr>
  );
}

function BoundaryList({
  boundaries,
  direction,
}: {
  boundaries: StudioPipelineBoundary[];
  direction: 'Input' | 'Output';
}) {
  return (
    <div className="workspace-pipeline-boundaries">
      {boundaries.length === 0 ? <span className="workspace-pipeline-empty-value">—</span> : null}
      {boundaries.map((boundary) => (
        <span
          aria-label={`${direction} ${getKindLabel(boundary.kind)}: ${boundary.nodeTitle}`}
          className={`workspace-pipeline-boundary workspace-pipeline-boundary-${direction.toLowerCase()}`}
          data-tooltip={`${boundary.nodeTitle} · ${boundary.name}`}
          key={`${boundary.nodeId}-${boundary.portId}-${boundary.name}`}
          tabIndex={0}
          title={`${boundary.nodeTitle} · ${boundary.name}`}
        >
          {getKindLabel(boundary.kind)}
        </span>
      ))}
    </div>
  );
}

function getKindLabel(kind: PipelineValueKind) {
  const labels: Record<PipelineValueKind, string> = {
    audio: 'Audio',
    boolean: 'Boolean',
    image: 'Image',
    image_collection: 'Images',
    json: 'JSON',
    number: 'Number',
    publication: 'Publication',
    text: 'Text',
    text_collection: 'Texts',
  };
  return labels[kind];
}

function formatIntegerString(value: string) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? integerFormatter.format(numeric) : '0';
}

function formatUsd(value: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric === 0) return '$0.00';
  if (numeric < 0.01) return `$${numeric.toFixed(6)}`;
  return `$${numeric.toFixed(4)}`;
}

function formatPublishedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  }).format(date);
}

async function copyTextToClipboard(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return;
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    if (!copied) throw new Error('Clipboard is unavailable.');
  }
}
