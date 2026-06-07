import type { ReactNode } from 'react';

export interface MaskEditPayload {
  assetId: string;
  maskDataUrl: string;
  model: string;
  prompt: string;
}

export interface ImageViewerEditorPanel {
  active: boolean;
  body: ReactNode;
  className?: string;
  height?: number;
  toolbar?: ReactNode;
}
