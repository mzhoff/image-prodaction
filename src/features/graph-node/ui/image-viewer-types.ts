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
  placement?: 'bottom' | 'right';
  label?: string;
  className?: string;
  height?: number;
  toolbar?: ReactNode;
}

export interface ImageViewerItem {
  id: string;
  height?: number;
  name?: string;
  thumbnailUrl?: string;
  url: string;
  width?: number;
}
