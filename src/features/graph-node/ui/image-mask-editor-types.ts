import type { MaskTool } from '../lib/image-mask-canvas';

export interface ImageMaskEditorHandle {
  canRedo: () => boolean;
  canUndo: () => boolean;
  clear: () => void;
  getMaskDataUrl: () => string | null;
  redo: () => void;
  reset: () => void;
  undo: () => void;
}

export interface ImageMaskEditorProps {
  brushSize: number;
  className?: string;
  enabled: boolean;
  height: number;
  initialMaskDataUrl?: string | null;
  onHistoryChange?: () => void;
  onMaskChange?: (maskDataUrl: string | null) => void;
  onPreviewToolChange?: (tool: MaskTool | null) => void;
  tool: MaskTool;
  width: number;
}
