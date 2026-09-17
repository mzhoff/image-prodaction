import { getNodeImageAssetId } from '@/entities/production-graph/model/graph-image-outputs';
import { getRemoteAssetContentUrl } from '@/entities/production-graph/lib/remote-asset';
import type { GraphProject } from '@/entities/production-graph/model/types';

export interface OverviewCard {
  x: number; y: number; width: number; height: number;
  title: string; text?: string; imageUrl?: string;
}
export interface CanvasOverview {
  cards: OverviewCard[];
  sections: (OverviewCard & { color: string })[];
  edges: { path: string; color: string }[];
}

/** Small, immutable presentation data. No DOM cloning, computed styles or originals. */
export function collectCanvasOverview(graph: GraphProject, container: HTMLElement): CanvasOverview {
  const elements = new Map([...container.querySelectorAll<HTMLElement>('[data-node-id]')]
    .map((element) => [element.dataset.nodeId, element]));
  const assets = new Map(graph.assets.map((asset) => [asset.id, asset]));
  return {
    cards: graph.nodes.map((node) => {
      const element = elements.get(node.id);
      const data = node.data as unknown as Record<string, unknown>;
      const assetId = getNodeImageAssetId(node, graph);
      const storage = assetId ? assets.get(assetId)?.storage : undefined;
      const remoteId = storage?.type === 'remote' ? storage.assetId : undefined;
      const text = [data.text, data.prompt, data.resultText].find((value) => typeof value === 'string');
      return {
        x: node.position.x, y: node.position.y,
        width: element?.offsetWidth || node.size.width,
        height: element?.offsetHeight || node.size.height,
        title: typeof data.title === 'string' ? data.title : node.type,
        text: typeof text === 'string' ? text.slice(0, 400) : undefined,
        imageUrl: remoteId ? getRemoteAssetContentUrl(remoteId, 'thumbnail') : undefined,
      };
    }),
    sections: graph.sections.map((section) => ({
      x: section.position.x, y: section.position.y, ...section.size,
      title: section.title, color: section.color || '#ddd',
    })),
    edges: [...container.querySelectorAll<SVGPathElement>('[data-edge-id]')].map((path) => ({
      path: path.getAttribute('d') || '', color: path.getAttribute('stroke') || '#5b6bf0',
    })),
  };
}

export function renderCanvasOverview(scene: CanvasOverview): Promise<File> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./canvas-overview.worker.ts', import.meta.url));
    const finish = () => { clearTimeout(timeout); worker.terminate(); };
    const timeout = setTimeout(() => { finish(); reject(new Error('Preview timed out.')); }, 30_000);
    worker.onmessage = (event: MessageEvent<{ blob?: Blob; error?: string }>) => {
      finish();
      if (event.data.blob) resolve(new File([event.data.blob], 'project-overview.webp', { type: 'image/webp' }));
      else reject(new Error(event.data.error || 'Preview failed.'));
    };
    worker.onerror = () => { finish(); reject(new Error('Preview worker failed.')); };
    worker.postMessage(scene);
  });
}
