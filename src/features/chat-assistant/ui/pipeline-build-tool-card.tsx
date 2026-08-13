import type { ChatToolRendererContext } from '@prodactionpro/chat-ui';

export function PipelineBuildConfirmation({ safePreview }: ChatToolRendererContext) {
  const preview = readPipelinePresentation(safePreview);
  if (!preview) return null;
  return (
    <div className="pipeline-build-tool-card">
      <strong>{preview.summary}</strong>
      {preview.documentName ? <span>Документ: {preview.documentName}</span> : null}
      <span>{formatPresentationCounts(preview)}</span>
      {preview.nodes.length ? (
        <ul>
          {preview.nodes.map((node) => (
            <li key={`${node.key}:${node.type}`}>
              <b>{node.title}</b>
              <small>{node.type}</small>
              {Object.keys(node.settings).length ? (
                <small>{formatSettings(node.settings)}</small>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {preview.warnings.length ? (
        <div className="pipeline-build-tool-card-warnings" role="status">
          {preview.warnings.map((warning) => <small key={warning}>{warning}</small>)}
        </div>
      ) : null}
    </div>
  );
}

export function PipelineBuildResult({ safeResult }: ChatToolRendererContext) {
  const result = readPipelinePresentation(safeResult);
  if (!result) return null;
  return (
    <div className="pipeline-build-tool-card pipeline-build-tool-card-success">
      <strong>{result.action === 'update-pipeline' ? 'Пайплайн обновлён' : 'Пайплайн создан'}</strong>
      {result.documentName ? <span>{result.documentName}</span> : null}
      <span>{formatPresentationCounts(result)}</span>
    </div>
  );
}

function readPipelinePresentation(value: Record<string, unknown> | undefined) {
  if (!value || (value.action !== 'build-pipeline' && value.action !== 'update-pipeline')) return undefined;
  return {
    action: value.action === 'update-pipeline' ? 'update-pipeline' as const : 'build-pipeline' as const,
    addedEdgeCount: readCount(value.addedEdgeCount),
    addedNodeCount: readCount(value.addedNodeCount),
    documentName: typeof value.documentName === 'string' ? value.documentName : undefined,
    movedNodeCount: readCount(value.movedNodeCount),
    nodes: Array.isArray(value.nodes) ? value.nodes.flatMap((node) => {
      if (!isRecord(node)
        || typeof node.key !== 'string'
        || typeof node.title !== 'string'
        || typeof node.type !== 'string') return [];
      return [{
        key: node.key,
        settings: readSafeSettings(node.settings),
        title: node.title,
        type: node.type,
      }];
    }).slice(0, 12) : [],
    summary: typeof value.summary === 'string' ? value.summary : 'Изменение графа',
    removedEdgeCount: readCount(value.removedEdgeCount),
    updatedNodeCount: readCount(value.updatedNodeCount),
    warnings: Array.isArray(value.warnings)
      ? value.warnings.filter((warning): warning is string => typeof warning === 'string').slice(0, 12)
      : [],
  };
}

function formatPresentationCounts(value: {
  action: 'build-pipeline' | 'update-pipeline';
  addedEdgeCount: number;
  addedNodeCount: number;
  movedNodeCount: number;
  removedEdgeCount: number;
  updatedNodeCount: number;
}) {
  if (value.action === 'build-pipeline') return `${value.addedNodeCount} нод · ${value.addedEdgeCount} связей`;
  return [
    `${value.addedNodeCount} новых нод`,
    `${value.updatedNodeCount} изменено`,
    ...(value.movedNodeCount ? [`${value.movedNodeCount} расставлено`] : []),
    `${value.addedEdgeCount} новых связей`,
    `${value.removedEdgeCount} удалено`,
  ].join(' · ');
}

function readCount(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}

function readSafeSettings(value: unknown) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, setting]) => (
    typeof setting === 'string' || typeof setting === 'number' ? [[key, setting]] : []
  )).slice(0, 12));
}

function formatSettings(settings: Record<string, string | number>) {
  return Object.entries(settings).map(([key, value]) => `${key}: ${String(value)}`).join(' · ');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
