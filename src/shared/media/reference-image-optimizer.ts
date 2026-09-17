import sharp from 'sharp';

/** Server-side transport copy only. Never resize, overwrite an asset, or fetch a URL. */
export async function optimizeReferenceImage(dataUrl: string): Promise<string> {
  const prefix = /^data:image\/(png|jpeg);base64,/.exec(dataUrl);
  if (!prefix || dataUrl.length > 30 * 1024 * 1024) return dataUrl;
  try {
    const bytes = Buffer.from(dataUrl.slice(prefix[0].length), 'base64');
    const image = sharp(bytes, { limitInputPixels: 40_000_000, failOn: 'warning' });
    const metadata = await image.metadata();
    // WebP is 8-bit and has dimension limits. Do not flatten animation or change
    // unusual colour spaces/bit depth just to save transfer bytes.
    if (!metadata.width || !metadata.height || metadata.width > 16_383 || metadata.height > 16_383
      || (metadata.pages ?? 1) > 1 || metadata.depth !== 'uchar' || metadata.space !== 'srgb') return dataUrl;
    const optimized = await image.keepMetadata().webp({ lossless: true, effort: 3 })
      .timeout({ seconds: 10 }).toBuffer();
    const candidate = `data:image/webp;base64,${optimized.toString('base64')}`;
    return candidate.length < dataUrl.length ? candidate : dataUrl;
  } catch {
    // Optimisation is best-effort. The provider still receives the original
    // on unsupported encodings, decode errors or the bounded encoding timeout.
    return dataUrl;
  }
}
