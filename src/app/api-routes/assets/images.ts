import { z } from 'zod';
import { deleteS3AssetObject, uploadAssetBytesToS3 } from '@/shared/storage/s3-assets';

export const runtime = 'nodejs';

const deleteAssetSchema = z.object({
  bucket: z.string().min(1),
  key: z.string().min(1),
});

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get('file');

  if (!(file instanceof File)) {
    return Response.json({ error: 'Image file is required.' }, { status: 400 });
  }

  if (!file.type.startsWith('image/')) {
    return Response.json({ error: 'Only image uploads are supported.' }, { status: 400 });
  }

  try {
    const asset = await uploadAssetBytesToS3({
      buffer: Buffer.from(await file.arrayBuffer()),
      contentType: file.type || 'image/png',
      fileName: file.name || undefined,
      kind: 'image',
      namePrefix: 'assets',
    });

    return Response.json({
      asset,
      imageUrl: asset.storage.publicUrl,
    });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : 'S3 image upload failed.',
    }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const parsed = deleteAssetSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await deleteS3AssetObject(parsed.data);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : 'S3 image delete failed.',
    }, { status: 500 });
  }
}
