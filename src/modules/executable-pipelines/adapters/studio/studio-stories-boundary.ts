import type { GraphEdge, ProductionNode } from '@/entities/production-graph/model/types';
import { invalidPipeline } from './studio-graph-resolution';

/** Compile a semantic terminal into the existing immutable output mechanism. */
export function expandStoriesBoundary(nodes: ProductionNode[], edges: GraphEdge[]) {
  const stories = nodes.filter((node) => node.type === 'reverieStories');
  if (!stories.length || nodes.some((node) => node.type === 'pipelineOutput')) return { nodes, edges };
  const terminals = stories.filter((node) => !edges.some((edge) => edge.sourceNodeId === node.id));
  if (terminals.length !== 1) throw invalidPipeline('В секции должна быть одна терминальная REVERIE Stories. Соедините слайды через режим «Собрать историю».');
  const story = terminals[0]!;
  if (!nodes.some((node) => node.type === 'pipelineInput')) throw invalidPipeline('Добавьте Pipeline Input с полем brief перед REVERIE Stories.');
  if (edges.some((edge) => edge.sourceNodeId === story.id)) throw invalidPipeline('REVERIE Stories должна завершать секцию.');
  let id = `${story.id}-output-boundary`;
  while (nodes.some((node) => node.id === id)) id += '-1';
  const boundary: ProductionNode = { ...story, id, type: 'pipelineOutput', data: {
    title: 'REVERIE Stories', fields: [{ id: 'story', key: 'story', kind: 'json', required: true }],
  } };
  return { nodes: [...nodes, boundary], edges: [...edges, {
    id: `${id}-edge`, sourceNodeId: story.id, sourcePortId: 'story', targetNodeId: id, targetPortId: 'field:story',
  }], syntheticBoundaryId: id, story };
}
