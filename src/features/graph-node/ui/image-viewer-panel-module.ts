import type { MediaViewerModule } from '@prodactionpro/ui-media';
import type { ReactNode } from 'react';
import type { ImageViewerEditorPanel } from './image-viewer-types';

/** Curves/adjustments keep their own state and callbacks in the canvas node. */
export function createImageViewerPanelModule(panel?: ImageViewerEditorPanel, media?: ReactNode): MediaViewerModule | undefined {
  if (!panel && media == null) return undefined;
  return {
    ...panel,
    id: 'image-production-panel',
    active: panel?.active ?? true,
    media,
  };
}
