import { normalizeNodeSize } from './node-layout';
import type { ProductionNode } from './types';
import {
  QR_CODE_DEFAULTS,
  normalizeQrCodeOptions,
  type QrCodeOptions,
} from '@/shared/qr-code';

export function normalizeQrCodeNode(node: ProductionNode): ProductionNode {
  const data = node.data as unknown as Record<string, unknown>;
  const options = Object.fromEntries(
    (Object.keys(QR_CODE_DEFAULTS) as Array<keyof QrCodeOptions>).map((key) => [
      key,
      normalizeQrCodeOption(data, key),
    ]),
  ) as unknown as QrCodeOptions;

  return {
    ...node,
    size: normalizeNodeSize(node.type, node.size),
    data: {
      title: typeof data.title === 'string' && data.title.trim() ? data.title : 'QR Code',
      content: typeof data.content === 'string' ? data.content.slice(0, 2_048) : '',
      ...options,
      message: typeof data.message === 'string' ? data.message : undefined,
      resultAssetId: typeof data.resultAssetId === 'string' ? data.resultAssetId : undefined,
      resultSignature: typeof data.resultSignature === 'string' ? data.resultSignature : undefined,
    },
  } as ProductionNode;
}

function normalizeQrCodeOption<K extends keyof QrCodeOptions>(
  data: Record<string, unknown>,
  key: K,
): QrCodeOptions[K] {
  try {
    return normalizeQrCodeOptions({ [key]: data[key] })[key];
  } catch {
    return QR_CODE_DEFAULTS[key];
  }
}
