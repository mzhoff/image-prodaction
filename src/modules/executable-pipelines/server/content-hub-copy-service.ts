import { isDeepStrictEqual } from 'node:util';
import { getDocument } from '@/entities/document/server/document-service';
import { CONTENT_HUB_CAPABILITIES, type ContentHubPresetEntry } from '@/entities/production-graph/model/content-hub-starter-preset';
import { createPipelineTemplateExport } from '@/entities/production-graph/model/project-portability';
import { createEmptyProjectUiState } from '@/entities/production-graph/model/project-schema';
import { compileStudioSection } from '../adapters/studio/studio-pipeline-compiler';
import { findRuntimePublishedVersion } from './runtime-catalog-service';
import { listRuntimeGrants } from './runtime-grant-read-service';
import { requireRuntimeClient, type RuntimeSessionActor } from './runtime-client-auth';
import { isProductionPipelineHandlerSupported } from './pipeline-production-manifest';

const allowedFields: Record<string, string[]> = {
  pipelineInput: ['fields'], pipelineOutput: ['fields'],
  textPrompt: ['text', 'variables', 'variableDisplayMode', 'textareaHeight'],
  textGeneration: ['instruction', 'model', 'reasoning', 'temperature', 'outputStyle'],
  generateImage: ['prompt', 'model', 'aspectRatio', 'size'], exportImage: ['background', 'format', 'quality', 'scale'],
};

/** Explicit operator copy. It reads authorized sources, but never changes their owner. */
export async function prepareContentHubCopies(actor: RuntimeSessionActor, sourceClientId: string): Promise<ContentHubPresetEntry[]> {
  const client = await requireRuntimeClient(actor, sourceClientId);
  if (client.sourceApplication !== 'content-hub') throw new Error('Source is not Content Hub.');
  const grants = (await listRuntimeGrants(actor, sourceClientId)).filter((grant) => grant.enabled);
  return Promise.all(CONTENT_HUB_CAPABILITIES.map(async (capabilityKey) => {
    const matches = grants.filter((grant) => grant.capabilityKey === capabilityKey);
    if (matches.length !== 1) throw new Error(`Expected one source grant for ${capabilityKey}.`);
    const grant = matches[0]!;
    const source = await findRuntimePublishedVersion(actor.workspaceId, grant.pipelinePublicId, grant.pinned.version);
    if (!source.pipeline.originDocumentId || !source.version.sourceMetadata) throw new Error('Source has no editable Studio document.');
    const current = await getDocument(actor.userId, source.pipeline.originDocumentId);
    if (!current.snapshot) throw new Error('Source document is empty.');
    const metadata = source.version.sourceMetadata;
    const ids = new Set([...source.version.compiledPlan.definition.nodes.map((node) => node.id), ...metadata.inputs.map((port) => port.nodeId), ...metadata.outputs.map((port) => port.nodeId)]);
    const nodes = current.snapshot.project.nodes.filter((node) => ids.has(node.id)).map((node) => {
      const fields = allowedFields[node.type];
      if (!fields) throw new Error(`Unsupported node in safe copy: ${node.type}`);
      const data = Object.fromEntries(['title', ...fields].filter((key) => key in node.data).map((key) => [key, (node.data as unknown as Record<string, unknown>)[key]]));
      return { ...node, status: 'idle' as const, data: data as unknown as typeof node.data };
    });
    const sections = current.snapshot.project.sections.filter((section) => section.id === metadata.sectionId);
    const template = createPipelineTemplateExport({ ...current.snapshot.project, nodes, sections,
      edges: current.snapshot.project.edges.filter((edge) => ids.has(edge.sourceNodeId) && ids.has(edge.targetNodeId)),
      assets: [], presets: [], subjects: [], locations: [], publications: [], runs: [], selectedNodeIds: [], selectedSectionIds: [],
    }, createEmptyProjectUiState());
    const compiled = compileStudioSection(template.project, metadata.sectionId, { isHandlerSupported: isProductionPipelineHandlerSupported });
    if (!isDeepStrictEqual(compiled.compiledPlan, source.version.compiledPlan)) throw new Error(`Draft differs from pinned ${capabilityKey}; copy requires review.`);
    return { capabilityKey, name: source.pipeline.name, sectionId: metadata.sectionId, snapshot: { ...template, kind: 'projectSnapshot' } };
  }));
}
