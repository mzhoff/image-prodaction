const SNAPSHOT_WIDTH = 840;
const SNAPSHOT_HEIGHT = 500;
const SNAPSHOT_QUALITY = 0.72;
const SNAPSHOT_BACKGROUND = '#f4f4f4';

export async function captureCanvasSnapshot(element: HTMLElement) {
  await nextFrame();
  await waitForCanvasImages(element);
  const { toCanvas } = await import('html-to-image');
  const source = await toCanvas(element, {
    backgroundColor: SNAPSHOT_BACKGROUND,
    filter: includeInSnapshot,
    height: element.clientHeight,
    pixelRatio: 1,
    skipFonts: true,
    width: element.clientWidth,
  });
  const output = document.createElement('canvas');
  output.width = SNAPSHOT_WIDTH;
  output.height = SNAPSHOT_HEIGHT;
  const context = output.getContext('2d');
  if (!context) throw new Error('Could not prepare the project snapshot.');

  context.fillStyle = SNAPSHOT_BACKGROUND;
  context.fillRect(0, 0, output.width, output.height);
  drawContained(context, source, output.width, output.height);

  const blob = await canvasToBlob(output);
  const extension = blob.type === 'image/webp' ? 'webp' : 'png';
  return new File([blob], `project-snapshot-${Date.now()}.${extension}`, {
    type: blob.type,
  });
}

function includeInSnapshot(node: HTMLElement) {
  return !node.hasAttribute?.('data-snapshot-exclude');
}

function drawContained(
  context: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  targetWidth: number,
  targetHeight: number,
) {
  const scale = Math.min(targetWidth / source.width, targetHeight / source.height);
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const x = Math.round((targetWidth - width) / 2);
  const y = Math.round((targetHeight - height) / 2);
  context.drawImage(source, x, y, width, height);
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((webp) => {
      if (webp) {
        resolve(webp);
        return;
      }
      canvas.toBlob((png) => {
        if (png) resolve(png);
        else reject(new Error('Could not compress the project snapshot.'));
      }, 'image/png');
    }, 'image/webp', SNAPSHOT_QUALITY);
  });
}

function nextFrame() {
  return new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
}

async function waitForCanvasImages(element: HTMLElement) {
  const pending = Array.from(element.querySelectorAll('img')).filter((image) => (
    !image.complete && !image.closest('[data-snapshot-exclude]')
  ));
  if (pending.length === 0) return;

  await Promise.race([
    Promise.all(pending.map((image) => new Promise<void>((resolve) => {
      image.addEventListener('load', () => resolve(), { once: true });
      image.addEventListener('error', () => resolve(), { once: true });
    }))),
    new Promise<void>((resolve) => window.setTimeout(resolve, 2_000)),
  ]);
}
