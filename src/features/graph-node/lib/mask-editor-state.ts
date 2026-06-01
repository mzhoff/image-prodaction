export interface MaskHistoryEntry {
  mask: ImageData;
  visible: ImageData;
}

export function getMaskEditorState(visibleCanvas: HTMLCanvasElement, maskCanvas: HTMLCanvasElement): MaskHistoryEntry | null {
  const visibleContext = visibleCanvas.getContext('2d');
  const maskContext = maskCanvas.getContext('2d');
  if (!visibleContext || !maskContext) return null;

  return {
    mask: maskContext.getImageData(0, 0, maskCanvas.width, maskCanvas.height),
    visible: visibleContext.getImageData(0, 0, visibleCanvas.width, visibleCanvas.height),
  };
}

export function applyMaskEditorState(
  visibleCanvas: HTMLCanvasElement,
  maskCanvas: HTMLCanvasElement,
  state: MaskHistoryEntry,
) {
  const visibleContext = visibleCanvas.getContext('2d');
  const maskContext = maskCanvas.getContext('2d');
  if (!visibleContext || !maskContext) return;

  visibleContext.putImageData(state.visible, 0, 0);
  maskContext.putImageData(state.mask, 0, 0);
}
