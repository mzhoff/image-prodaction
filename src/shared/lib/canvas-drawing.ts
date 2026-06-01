export type CanvasBrushTool = 'brush' | 'eraser';

export interface CanvasPoint {
  x: number;
  y: number;
}

export function drawCanvasSegment({
  brushSize,
  canvas,
  color,
  eraserColor = '#fff',
  eraserCompositeOperation = 'source-over',
  from,
  to,
  tool,
}: {
  brushSize: number;
  canvas: HTMLCanvasElement;
  color: string;
  eraserColor?: string;
  eraserCompositeOperation?: GlobalCompositeOperation;
  from: CanvasPoint;
  to: CanvasPoint;
  tool: CanvasBrushTool;
}) {
  const context = canvas.getContext('2d');
  if (!context) return;

  const isEraser = tool === 'eraser';
  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = brushSize;
  context.globalCompositeOperation = isEraser ? eraserCompositeOperation : 'source-over';
  context.strokeStyle = isEraser ? eraserColor : color;
  context.fillStyle = context.strokeStyle;

  if (Math.hypot(to.x - from.x, to.y - from.y) < 0.1) {
    context.beginPath();
    context.arc(from.x, from.y, brushSize / 2, 0, Math.PI * 2);
    context.fill();
  } else {
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  }
  context.restore();
}

export function getCanvasPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number, width = canvas.width, height = canvas.height) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * width,
    y: ((clientY - rect.top) / rect.height) * height,
  };
}

export function updateBrushCursorElement({
  brushSize,
  canvas,
  clientX,
  clientY,
  cursor,
  sourceWidth = canvas.width,
  tool,
}: {
  brushSize: number;
  canvas: HTMLCanvasElement;
  clientX: number;
  clientY: number;
  cursor: HTMLDivElement | null;
  sourceWidth?: number;
  tool: CanvasBrushTool;
}) {
  if (!cursor) return;

  const rect = canvas.getBoundingClientRect();
  const displayBrushSize = Math.max(4, brushSize * (rect.width / sourceWidth));
  cursor.style.display = 'block';
  cursor.style.width = `${displayBrushSize}px`;
  cursor.style.height = `${displayBrushSize}px`;
  cursor.style.transform = `translate(${clientX - rect.left}px, ${clientY - rect.top}px) translate(-50%, -50%)`;
  cursor.dataset.tool = tool;
}

export function hideBrushCursorElement(cursor: HTMLDivElement | null) {
  if (cursor) cursor.style.display = 'none';
}

export function getPointerTool(buttons: number, fallback: CanvasBrushTool) {
  return (buttons & 2) === 2 ? 'eraser' : fallback;
}

export function clearCanvas(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d');
  if (context) context.clearRect(0, 0, canvas.width, canvas.height);
}

export function fillCanvas(canvas: HTMLCanvasElement, color = '#fff') {
  const context = canvas.getContext('2d');
  if (!context) return;
  context.fillStyle = color;
  context.fillRect(0, 0, canvas.width, canvas.height);
}

export function getCanvasState(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d');
  return context ? context.getImageData(0, 0, canvas.width, canvas.height) : null;
}

export function putCanvasState(canvas: HTMLCanvasElement, state: ImageData) {
  const context = canvas.getContext('2d');
  if (context) context.putImageData(state, 0, 0);
}

export function hasAlphaPixels(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d');
  if (!context) return false;

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] > 0) return true;
  }
  return false;
}
