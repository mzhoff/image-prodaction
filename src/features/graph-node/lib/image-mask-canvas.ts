import { drawCanvasSegment, hasAlphaPixels, updateBrushCursorElement } from '@/shared/lib/canvas-drawing';

export type MaskTool = 'brush' | 'eraser';

export function drawMaskSegment({
  brushSize,
  canvas,
  from,
  mask,
  to,
  tool,
}: {
  brushSize: number;
  canvas: HTMLCanvasElement;
  from: { x: number; y: number };
  mask?: boolean;
  to: { x: number; y: number };
  tool: MaskTool;
}) {
  drawCanvasSegment({
    brushSize,
    canvas,
    color: mask ? '#fff' : 'rgba(31, 98, 255, 0.55)',
    eraserCompositeOperation: 'destination-out',
    from,
    to,
    tool,
  });
}

export function updateMaskCursor(
  canvas: HTMLCanvasElement,
  cursor: HTMLDivElement | null,
  clientX: number,
  clientY: number,
  brushSize: number,
  sourceWidth: number,
  tool: MaskTool,
) {
  updateBrushCursorElement({ brushSize, canvas, clientX, clientY, cursor, sourceWidth, tool });
}

export function getMaskCanvasDataUrl(maskCanvas: HTMLCanvasElement | null) {
  if (!maskCanvas || !hasAlphaPixels(maskCanvas)) return null;

  const output = document.createElement('canvas');
  output.width = maskCanvas.width;
  output.height = maskCanvas.height;
  const context = output.getContext('2d');
  if (!context) return null;
  context.fillStyle = '#000';
  context.fillRect(0, 0, output.width, output.height);
  context.drawImage(maskCanvas, 0, 0);
  return output.toDataURL('image/png');
}

export function loadMaskImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to load mask image.'));
    image.src = dataUrl;
  });
}

export function paintStoredMask({
  image,
  maskCanvas,
  visibleCanvas,
}: {
  image: HTMLImageElement;
  maskCanvas: HTMLCanvasElement;
  visibleCanvas: HTMLCanvasElement;
}) {
  const visibleContext = visibleCanvas.getContext('2d');
  const maskContext = maskCanvas.getContext('2d');
  if (!visibleContext || !maskContext) return;

  const source = document.createElement('canvas');
  source.width = maskCanvas.width;
  source.height = maskCanvas.height;
  const sourceContext = source.getContext('2d');
  if (!sourceContext) return;

  sourceContext.drawImage(image, 0, 0, source.width, source.height);
  const sourcePixels = sourceContext.getImageData(0, 0, source.width, source.height);
  const visiblePixels = visibleContext.createImageData(visibleCanvas.width, visibleCanvas.height);
  const maskPixels = maskContext.createImageData(maskCanvas.width, maskCanvas.height);

  for (let index = 0; index < sourcePixels.data.length; index += 4) {
    const alpha = sourcePixels.data[index + 3] / 255;
    const strength = Math.max(sourcePixels.data[index], sourcePixels.data[index + 1], sourcePixels.data[index + 2]) * alpha;
    if (strength <= 0) continue;

    visiblePixels.data[index] = 31;
    visiblePixels.data[index + 1] = 98;
    visiblePixels.data[index + 2] = 255;
    visiblePixels.data[index + 3] = Math.round(strength * 0.55);

    maskPixels.data[index] = 255;
    maskPixels.data[index + 1] = 255;
    maskPixels.data[index + 2] = 255;
    maskPixels.data[index + 3] = Math.round(strength);
  }

  visibleContext.putImageData(visiblePixels, 0, 0);
  maskContext.putImageData(maskPixels, 0, 0);
}
