import { z } from 'zod';
import { uploadGeneratedImageToS3 } from '@/shared/storage/s3-assets';

export const runtime = 'nodejs';

const FAL_BACKGROUND_REMOVE_ENDPOINT = 'https://fal.run/fal-ai/bria/background/remove';

const removeBackgroundSchema = z.object({
  imageDataUrl: z.string().min(1),
});

export async function POST(request: Request) {
  const parsed = removeBackgroundSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const apiKey = process.env.FAL_API_KEY || process.env.FAL_KEY;
  if (!apiKey) {
    return Response.json({ error: 'FAL_API_KEY is not configured.' }, { status: 500 });
  }

  try {
    const response = await fetch(FAL_BACKGROUND_REMOVE_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_url: parsed.data.imageDataUrl,
        sync_mode: true,
      }),
    });
    const result = await readFalJson(response);

    if (!response.ok) {
      return Response.json({
        error: formatFalError(result, 'FAL background removal failed'),
      }, { status: response.status });
    }

    const imageUrl = result?.image?.url;
    if (typeof imageUrl !== 'string' || imageUrl.length === 0) {
      return Response.json({ error: 'FAL did not return a background-removed image.' }, { status: 502 });
    }

    const asset = await uploadGeneratedImageToS3({
      namePrefix: 'removed-bg',
      sourceUrl: imageUrl,
    });

    return Response.json({
      asset,
      imageUrl: asset.storage.publicUrl,
      message: 'Background removed with FAL Bria RMBG 2.0.',
      provider: 'fal',
    });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : 'FAL background removal failed',
    }, { status: 502 });
  }
}

async function readFalJson(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function formatFalError(error: unknown, fallback: string) {
  if (typeof error === 'string') return error;
  if (!error || typeof error !== 'object') return fallback;

  const detail = 'detail' in error ? error.detail : undefined;
  if (typeof detail === 'string') return detail;
  if (detail && typeof detail === 'object' && 'message' in detail && typeof detail.message === 'string') {
    return detail.message;
  }

  if ('message' in error && typeof error.message === 'string') return error.message;
  return JSON.stringify(error).slice(0, 500);
}

