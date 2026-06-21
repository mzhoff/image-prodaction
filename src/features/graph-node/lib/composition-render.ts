import type { CompositionLayerBlendMode, CompositionLayerFit, CompositionTextAlign, CompositionTextVerticalAlign } from '@/entities/production-graph/model/types';

export interface CompositionRenderImageLayer {
  assetName?: string;
  blendMode: CompositionLayerBlendMode;
  blob: Blob;
  fit: CompositionLayerFit;
  flipX: boolean;
  flipY: boolean;
  height: number;
  kind: 'image';
  opacity: number;
  rotation: number;
  width: number;
  x: number;
  y: number;
}

export interface CompositionRenderTextLayer {
  align: CompositionTextAlign;
  blendMode: CompositionLayerBlendMode;
  color: string;
  flipX: boolean;
  flipY: boolean;
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  height: number;
  kind: 'text';
  letterSpacing: number;
  lineHeight: number;
  opacity: number;
  rotation: number;
  text: string;
  verticalAlign: CompositionTextVerticalAlign;
  width: number;
  x: number;
  y: number;
}

export type CompositionRenderLayer = CompositionRenderImageLayer | CompositionRenderTextLayer;

export interface CompositionRenderOptions {
  background?: string;
  height: number;
  layers: CompositionRenderLayer[];
  width: number;
}

export async function renderCompositionToBlob(options: CompositionRenderOptions) {
  await waitForDocumentFonts();

  const canvas = document.createElement('canvas');
  canvas.width = options.width;
  canvas.height = options.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas renderer is not available.');

  context.clearRect(0, 0, canvas.width, canvas.height);
  if (options.background) {
    context.fillStyle = options.background;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  for (const layer of options.layers) {
    context.save();
    context.globalAlpha = Math.min(1, Math.max(0, layer.opacity / 100));
    context.globalCompositeOperation = getCanvasCompositeOperation(layer.blendMode);
    context.translate(layer.x + layer.width / 2, layer.y + layer.height / 2);
    context.rotate((layer.rotation * Math.PI) / 180);
    context.scale(layer.flipX ? -1 : 1, layer.flipY ? -1 : 1);
    context.translate(-layer.width / 2, -layer.height / 2);

    if (layer.kind === 'image') {
      const image = await loadImageFromBlob(layer.blob);
      drawFittedImage(context, image, layer.width, layer.height, layer.fit);
    } else {
      drawTextLayer(context, layer);
    }

    context.restore();
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Composition render failed.'));
    }, 'image/png');
  });
}

function drawFittedImage(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource & { width: number; height: number },
  targetWidth: number,
  targetHeight: number,
  fit: CompositionLayerFit,
) {
  if (fit === 'stretch') {
    context.drawImage(image, 0, 0, targetWidth, targetHeight);
    return;
  }

  const sourceWidth = image.width || targetWidth;
  const sourceHeight = image.height || targetHeight;
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = targetWidth / targetHeight;
  const fill = fit === 'fill';
  const useWidth = fill ? sourceRatio < targetRatio : sourceRatio > targetRatio;
  const width = useWidth ? targetWidth : targetHeight * sourceRatio;
  const height = useWidth ? targetWidth / sourceRatio : targetHeight;
  const x = (targetWidth - width) / 2;
  const y = (targetHeight - height) / 2;
  context.drawImage(image, x, y, width, height);
}

function drawTextLayer(context: CanvasRenderingContext2D, layer: CompositionRenderTextLayer) {
  const font = getCanvasFont(layer);
  const letterSpacingPx = getLetterSpacingPx(layer);
  const lines = getBrowserWrappedLines(layer) ?? wrapText(context, layer.text, layer.width, font, letterSpacingPx);
  context.beginPath();
  context.rect(0, 0, layer.width, layer.height);
  context.clip();
  context.font = font;
  context.fontKerning = 'normal';
  context.fillStyle = layer.color;
  context.textAlign = layer.align;
  context.textBaseline = 'top';
  const lineHeight = Math.max(1, layer.lineHeight);
  const x = layer.align === 'center' ? layer.width / 2 : layer.align === 'right' ? layer.width : 0;
  const visibleLineCount = Math.max(1, Math.floor(layer.height / lineHeight));
  const visibleLines = lines.slice(0, visibleLineCount);
  const textBlockHeight = visibleLines.length * lineHeight;
  const yOffset = getVerticalTextOffset(layer.height, textBlockHeight, layer.verticalAlign);
  visibleLines.forEach((line, index) => {
    drawTextLine(context, line, x, yOffset + index * lineHeight, layer.align, letterSpacingPx);
  });
}

function getCanvasFont(layer: CompositionRenderTextLayer) {
  return `${layer.fontWeight} ${layer.fontSize}px ${layer.fontFamily}`;
}

function getBrowserWrappedLines(layer: CompositionRenderTextLayer) {
  if (typeof document === 'undefined' || !document.body) return undefined;

  const container = document.createElement('div');
  const tokenSpans: HTMLSpanElement[] = [];
  Object.assign(container.style, {
    boxSizing: 'border-box',
    contain: 'layout style',
    fontFamily: layer.fontFamily,
    fontSize: `${layer.fontSize}px`,
    fontWeight: layer.fontWeight,
    left: '-100000px',
    letterSpacing: `${getLetterSpacingPx(layer)}px`,
    lineHeight: `${Math.max(1, layer.lineHeight)}px`,
    position: 'fixed',
    textAlign: layer.align,
    top: '-100000px',
    visibility: 'hidden',
    whiteSpace: 'pre-wrap',
    width: `${Math.max(1, layer.width)}px`,
  } satisfies Partial<CSSStyleDeclaration>);

  const paragraphs = layer.text.split('\n');
  paragraphs.forEach((paragraph, paragraphIndex) => {
    const tokens = paragraph.match(/\S+\s*/g) ?? [''];
    tokens.forEach((token) => {
      const span = document.createElement('span');
      span.textContent = token || '\u200b';
      span.dataset.text = token;
      tokenSpans.push(span);
      container.appendChild(span);
    });
    if (paragraphIndex < paragraphs.length - 1) container.appendChild(document.createElement('br'));
  });

  document.body.appendChild(container);
  try {
    const rows: Array<{ top: number; tokens: string[] }> = [];
    tokenSpans.forEach((span) => {
      const top = Math.round(span.offsetTop);
      const row = rows.find((item) => Math.abs(item.top - top) <= 1);
      const text = span.dataset.text ?? span.textContent ?? '';
      if (row) row.tokens.push(text);
      else rows.push({ top, tokens: [text] });
    });
    return rows
      .sort((a, b) => a.top - b.top)
      .map((row) => row.tokens.join('').trimEnd());
  } finally {
    container.remove();
  }
}

async function waitForDocumentFonts() {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  try {
    await document.fonts.ready;
  } catch {
    // Canvas can still render with fallback fonts if the browser font API fails.
  }
}

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number, font: string, letterSpacing: number) {
  context.font = font;
  return text.split(/\n/).flatMap((paragraph) => {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) return [''];
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (measureTextWidth(context, candidate, letterSpacing) <= maxWidth || !current) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines;
  });
}

function drawTextLine(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  align: CompositionTextAlign,
  letterSpacing: number,
) {
  if (letterSpacing === 0) {
    context.fillText(text, x, y);
    return;
  }

  const totalWidth = measureTextWidth(context, text, letterSpacing);
  let cursor = align === 'center' ? x - totalWidth / 2 : align === 'right' ? x - totalWidth : x;
  Array.from(text).forEach((character, index, characters) => {
    context.fillText(character, cursor, y);
    cursor += context.measureText(character).width + (index < characters.length - 1 ? letterSpacing : 0);
  });
}

function measureTextWidth(context: CanvasRenderingContext2D, text: string, letterSpacing: number) {
  const characters = Array.from(text);
  if (characters.length <= 1) return context.measureText(text).width;
  return characters.reduce((width, character) => width + context.measureText(character).width, 0)
    + letterSpacing * (characters.length - 1);
}

function getLetterSpacingPx(layer: Pick<CompositionRenderTextLayer, 'fontSize' | 'letterSpacing'>) {
  return (layer.fontSize * layer.letterSpacing) / 100;
}

function getVerticalTextOffset(height: number, textBlockHeight: number, align: CompositionTextVerticalAlign) {
  if (align === 'center') return Math.max(0, (height - textBlockHeight) / 2);
  if (align === 'bottom') return Math.max(0, height - textBlockHeight);
  return 0;
}

function loadImageFromBlob(blob: Blob) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load composition layer image.'));
    };
    image.src = url;
  });
}
function getCanvasCompositeOperation(blendMode: CompositionLayerBlendMode): GlobalCompositeOperation {
  if (blendMode === 'multiply'
    || blendMode === 'screen'
    || blendMode === 'overlay'
    || blendMode === 'darken'
    || blendMode === 'lighten'
    || blendMode === 'color-dodge'
    || blendMode === 'color-burn'
    || blendMode === 'hard-light'
    || blendMode === 'soft-light'
    || blendMode === 'difference'
    || blendMode === 'exclusion'
    || blendMode === 'hue'
    || blendMode === 'saturation'
    || blendMode === 'color'
    || blendMode === 'luminosity') {
    return blendMode;
  }
  if (blendMode === 'plus-lighter') return 'lighter';
  return 'source-over';
}
