import type { ProductionNode } from './types';

export function getRenderedNodeSize(node: ProductionNode) {
  const element = typeof document === 'undefined'
    ? null
    : document.querySelector<HTMLElement>(`[data-node-id="${node.id}"]`);

  return {
    width: element?.offsetWidth ?? node.size.width,
    height: element?.offsetHeight ?? node.size.height,
  };
}
