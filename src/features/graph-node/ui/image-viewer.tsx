'use client';

import Image from 'next/image';
import { ChevronLeft, ChevronRight, X } from '@prodactionpro/ui-core/icons';
import { MediaViewer } from '@prodactionpro/ui-media/client';
import type { MediaImageProps, MediaViewerModule } from '@prodactionpro/ui-media';
import type { ReactNode } from 'react';
import type { AssetRecord, GenerationResultMetadata } from '@/entities/production-graph/model/types';
import { SaveToLibraryButton } from '@/shared/ui/save-to-library-button';
import { hasOpenFloatingContextMenu } from '@/shared/ui/floating-context-menu';
import { useImageViewerItems } from '../model/use-image-viewer-items';
import { createImageViewerPanelModule } from './image-viewer-panel-module';
import type { ImageViewerEditorPanel, ImageViewerItem, MaskEditPayload } from './image-viewer-types';
import { useImageViewerMaskModule } from './use-image-viewer-mask-module';

export type { ImageViewerItem } from './image-viewer-types';

interface ImageViewerProps {
  asset?: AssetRecord;
  assetId?: string;
  assetMetadata?: Record<string, GenerationResultMetadata>;
  busy?: boolean;
  currentIndex: number;
  hasHistory: boolean;
  historyAssetIds: string[];
  items?: ImageViewerItem[];
  thumbnailLayout?: 'strip' | 'dock';
  maskDataUrl?: string;
  onClose: () => void;
  onMaskChange?: (maskDataUrl: string | null) => void;
  onMaskEdit?: (payload: MaskEditPayload) => Promise<void>;
  onNext: () => void;
  onPrevious: () => void;
  onSelectVersion: (index: number) => void;
  onSaveToLibrary?: (assetId: string) => Promise<void>;
  savedToLibrary?: boolean;
  sourceModel?: string;
  url: string;
  viewerPanel?: ImageViewerEditorPanel;
  viewerMedia?: ReactNode;
}

/** Compatibility facade: canvas nodes and Library keep their existing product API. */
export function ImageViewer({ asset, assetId, assetMetadata, busy, currentIndex, hasHistory, historyAssetIds,
  items, thumbnailLayout = 'strip', maskDataUrl, onClose, onMaskChange, onMaskEdit, onNext, onPrevious,
  onSelectVersion, onSaveToLibrary, savedToLibrary, sourceModel, url, viewerPanel, viewerMedia,
}: ImageViewerProps) {
  const media = useImageViewerItems({ asset, assetId, currentIndex, historyAssetIds, items, url });
  const currentItem = media.items.find((item) => item.id === media.selectedId);
  const mask = useImageViewerMaskModule({ asset, assetId, assetMetadata, maskDataUrl, onMaskChange, onMaskEdit,
    sourceModel, busy, width: asset?.width ?? currentItem?.width ?? 1200, height: asset?.height ?? currentItem?.height ?? 800 });
  const panel = createImageViewerPanelModule(viewerPanel, viewerMedia);
  const modules = [mask.module, panel].filter((module): module is MediaViewerModule => Boolean(module));
  const imageSizeLabel = mask.imageSizeLabel ?? (currentItem?.width && currentItem.height ? `${currentItem.width} × ${currentItem.height}px` : undefined);
  const hasMetadata = thumbnailLayout === 'dock' || modules.length > 0 || mask.sourceModelLabel || imageSizeLabel;

  return <MediaViewer
    items={hasHistory || thumbnailLayout === 'dock' ? media.items : media.items.filter((item) => item.id === media.selectedId)}
    selectedId={media.selectedId}
    onSelect={(id) => { const index = historyAssetIds.indexOf(id); if (index >= 0) onSelectVersion(index); }}
    onNext={onNext} onPrevious={onPrevious} onClose={onClose}
    layout={thumbnailLayout} label="Image viewer"
    labels={{ close: 'Close image viewer', previous: 'Previous generated image', next: 'Next generated image',
      variation: (index) => `Open generated image variation ${index + 1}` }}
    modules={modules}
    className={mask.maskOpen ? 'image-viewer-overlay-editing' : undefined}
    contentClassName={mask.localMaskMode ? 'image-viewer-content-with-local-mask' : undefined}
    isInteractionBlocked={hasOpenFloatingContextMenu}
    renderImage={renderViewerImage}
    icons={{ close: <X size={18} />, previous: <ChevronLeft size={24} />, next: <ChevronRight size={24} /> }}
    metadata={hasMetadata ? <>
      {mask.sourceModelLabel ? <span className="image-viewer-meta-model">{mask.sourceModelLabel}</span> : null}
      {imageSizeLabel ? <span className="image-viewer-meta-size">{imageSizeLabel}</span> : null}
    </> : undefined}
    actions={assetId && onSaveToLibrary ? <SaveToLibraryButton assetId={assetId}
      onSave={onSaveToLibrary} saved={savedToLibrary} disabled={busy} /> : undefined}
  />;
}

function renderViewerImage(props: MediaImageProps) {
  return <Image {...props} alt={props.alt} unoptimized draggable={false} />;
}
