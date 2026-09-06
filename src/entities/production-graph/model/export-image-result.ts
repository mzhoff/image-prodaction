import type { ExportImageNodeData } from './types';

export function createExportImageResultSignature(
  sourceAssetId: string,
  options: Pick<ExportImageNodeData, 'background' | 'format' | 'quality' | 'scale'>,
) {
  return [sourceAssetId, options.format, options.quality, options.scale, options.background].join(':');
}
