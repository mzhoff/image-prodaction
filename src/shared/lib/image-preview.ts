/** Legacy IndexedDB assets only. Remote previews are generated once and stored in S3. */
export async function createImagePreviewBlob(blob: Blob): Promise<Blob> {
  const image = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, 560 / Math.max(image.width, image.height));
    const canvas = new OffscreenCanvas(Math.max(1, Math.round(image.width * scale)), Math.max(1, Math.round(image.height * scale)));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image preview is unavailable.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await canvas.convertToBlob({ type: 'image/webp', quality: 0.82 });
  } finally { image.close(); }
}
