import type { CanvasOverview, OverviewCard } from './canvas-overview';

// A real worker: fetching/decoding thumbnails and drawing never run on the UI thread.
globalThis.onmessage = async (event: MessageEvent<CanvasOverview>) => {
  try {
    globalThis.postMessage({ blob: await drawOverview(event.data) });
  } catch {
    globalThis.postMessage({ error: 'Could not draw the project overview.' });
  }
};

async function drawOverview(scene: CanvasOverview) {
  const canvas = new OffscreenCanvas(840, 500);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable.');
  context.fillStyle = '#f4f4f4';
  context.fillRect(0, 0, 840, 500);
  const boxes = [...scene.cards, ...scene.sections];
  if (!boxes.length) return canvas.convertToBlob({ type: 'image/webp', quality: 0.8 });
  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const width = Math.max(...boxes.map((box) => box.x + box.width)) - minX;
  const height = Math.max(...boxes.map((box) => box.y + box.height)) - minY;
  const scale = Math.min(792 / Math.max(1, width), 452 / Math.max(1, height));
  context.translate((840 - width * scale) / 2, (500 - height * scale) / 2);
  context.scale(scale, scale);
  context.translate(-minX, -minY);
  for (const section of scene.sections) {
    context.fillStyle = section.color;
    context.globalAlpha = 0.15;
    context.fillRect(section.x, section.y, section.width, section.height);
    context.globalAlpha = 1;
    context.strokeStyle = '#aaa';
    context.strokeRect(section.x, section.y, section.width, section.height);
  }
  for (const edge of scene.edges) {
    context.strokeStyle = edge.color;
    context.lineWidth = 2;
    context.stroke(new Path2D(edge.path));
  }
  const urls = [...new Set(scene.cards.map((card) => card.imageUrl).filter((url): url is string => !!url))];
  const images = new Map<string, ImageBitmap>();
  try {
    // Bounded concurrency and count; huge graphs still render all cards, without
    // flooding the asset service or retaining an unbounded decoded image cache.
    const queue = urls.slice(0, 128);
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (queue.length) {
        const url = queue.shift()!;
        try {
          const response = await fetch(url, { credentials: 'same-origin', signal: AbortSignal.timeout(8_000) });
          if (response.ok) images.set(url, await createImageBitmap(await response.blob()));
        } catch { /* A missing thumbnail must not prevent an overview. */ }
      }
    }));
    for (const card of scene.cards) drawCard(context, card, card.imageUrl ? images.get(card.imageUrl) : undefined);
    return await canvas.convertToBlob({ type: 'image/webp', quality: 0.8 });
  } finally {
    images.forEach((image) => image.close());
  }
}

function drawCard(context: OffscreenCanvasRenderingContext2D, card: OverviewCard, image?: ImageBitmap) {
  const { x, y, width, height } = card;
  context.fillStyle = '#fff';
  context.beginPath(); context.roundRect(x, y, width, height, 12); context.fill();
  context.save(); context.clip();
  context.fillStyle = '#555'; context.font = 'bold 12px sans-serif';
  context.fillText(card.title.slice(0, 55), x + 14, y + 25, width - 28);
  if (image && height > 70) {
    const scale = Math.min((width - 24) / image.width, (height - 55) / image.height);
    context.drawImage(image, x + (width - image.width * scale) / 2, y + 38, image.width * scale, image.height * scale);
  } else if (card.text && height > 70) {
    context.font = '11px sans-serif'; context.fillStyle = '#777';
    const lineLength = Math.max(8, Math.floor((width - 28) / 6));
    for (let offset = 0, row = 0; offset < card.text.length && row < (height - 60) / 16; offset += lineLength, row++) {
      context.fillText(card.text.slice(offset, offset + lineLength).replaceAll('\n', ' '), x + 14, y + 48 + row * 16, width - 28);
    }
  }
  context.restore();
}
