import { z } from 'zod';
import { formatOpenRouterError, getOpenRouterErrorStatus, sendOpenRouterChat } from '@/shared/api/openrouter';
import { DEFAULT_ANALYSIS_MODEL } from '@/shared/api/openrouter-models';

export const runtime = 'nodejs';

const locationDescriptionSchema = z.object({
  imageDataUrls: z.array(z.string().min(1)).max(4).default([]),
  locationType: z.string().min(1).default('interior'),
  model: z.string().min(1).default(DEFAULT_ANALYSIS_MODEL),
  textNotes: z.array(z.string()).optional(),
});

const optionalString = z.preprocess((value) => (typeof value === 'string' ? value : ''), z.string());

const locationDescriptionDraftSchema = z.object({
  atmosphere: optionalString.default(''),
  description: optionalString.default(''),
  locationType: optionalString.default(''),
  mutableAttributes: optionalString.default(''),
  name: optionalString.default(''),
  negativeConstraints: optionalString.default(''),
  notes: optionalString.default(''),
  spatialLayout: optionalString.default(''),
});

export async function POST(request: Request) {
  const parsed = locationDescriptionSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const cleanTextNotes = (parsed.data.textNotes ?? []).map((item) => item.trim()).filter(Boolean);
  if (parsed.data.imageDataUrls.length === 0 && cleanTextNotes.length === 0) {
    return Response.json({ error: 'Attach image refs or text notes before generating a location description.' }, { status: 400 });
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return Response.json({
      draft: {
        atmosphere: 'Mock atmospheric description generated from attached references.',
        description: '[LOCATION ROLE]\nMock reusable location generated from attached references.\n\n[ENVIRONMENT DESCRIPTION]\nLayered production-ready description will be generated here when OpenRouter is configured.',
        locationType: parsed.data.locationType,
        mutableAttributes: 'Camera angle, time of day, weather, dressing, action, characters, props, and production style may adapt to the target prompt.',
        name: 'Reference location',
        negativeConstraints: 'Do not change core spatial identity, architecture, environment type, or key surface language.',
        notes: 'Mock response because OPENROUTER_API_KEY is not configured.',
        spatialLayout: 'Stable layout, scale cues, foreground/midground/background relationships, and recognizable environment geometry from the reference set.',
      },
      provider: 'mock',
    });
  }

  try {
    const prompt = buildLocationDescriptionPrompt(parsed.data.locationType, cleanTextNotes, parsed.data.imageDataUrls.length);
    const result = await sendOpenRouterChat({
      model: parsed.data.model,
      messages: [
        {
          role: 'system',
          content: [
            'You are a senior commercial image analyst and AI image-production prompt engineer.',
            'Analyze reference images as one reusable production location or environment.',
            'Return only compact valid JSON. Do not wrap it in markdown.',
            'Do not invent brand names, exact addresses, logos, or real-world claims not visible in the image.',
            'The description field must be a multiline layered description with explicit square-bracket headers.',
          ].join(' '),
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            ...parsed.data.imageDataUrls.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
          ],
        },
      ],
      modalities: ['text'],
      maxTokens: 2200,
      temperature: 0.25,
    });
    const content = result.choices?.[0]?.message?.content ?? '';
    const draft = locationDescriptionDraftSchema.parse(parseJsonObject(content));

    return Response.json({
      draft,
      message: 'Location description generated from attached sources.',
      provider: 'openrouter',
    });
  } catch (error) {
    return Response.json({
      error: formatOpenRouterError(error, 'OpenRouter location description failed'),
    }, { status: getOpenRouterErrorStatus(error) });
  }
}

function buildLocationDescriptionPrompt(locationType: string, cleanNotes: string[], imageCount: number) {
  return [
    `Создай reusable Location Builder passport из прикреплённых источников. Текущий тип локации, выбранный пользователем: ${locationType}.`,
    imageCount > 0
      ? 'Считай все reference images референсами одной библиотечной локации или одного окружения, если только они явно не являются разными местами.'
      : 'Reference images не приложены: собери паспорт только из connected text notes и явно помечай uncertainty там, где визуальных данных не хватает.',
    'Пиши на русском языке, но production terms можно оставлять на английском.',
    'Формат должен быть generation-ready: текст можно напрямую использовать как часть промпта для генерации изображения.',
    'Разделяй стабильную пространственную идентичность и mutable scene details. Не заноси случайный шум, временных людей, случайные предметы, compression artifacts и неудачный свет в stable location identity.',
    'Не выдумывай точный адрес, бренд, логотип, географическое название или исторический факт, если этого нет в reference images.',
    'Если тип локации нужно исправить, set locationType exactly one of: interior, exterior, urban, nature, studio, abstract.',
    'Верни строго JSON без markdown. JSON shape:',
    '{"name":"","locationType":"","description":"","spatialLayout":"","atmosphere":"","mutableAttributes":"","negativeConstraints":"","notes":""}',
    'Field contract:',
    '- name: короткое нейтральное working ID для библиотеки.',
    '- description: главный Description библиотеки. Обязательно используй квадратные заголовки слоев, каждый с новой строки. Не возвращай comma-only summary. Если слой неизвестен, напиши Unknown / needs reference.',
    'Exact description template:',
    '[LOCATION ROLE]\n...\n\n[ENVIRONMENT TYPE]\n...\n\n[ARCHITECTURE / GEOMETRY]\n...\n\n[SURFACES / MATERIALS]\n...\n\n[PROPS / SET DRESSING]\n...\n\n[SCALE CUES]\n...\n\n[MOOD]\n...\n\n[UNCERTAINTY]\n...',
    '- spatialLayout: что нельзя менять без потери узнаваемости локации: планировка, глубина, foreground/midground/background, геометрия, масштабы, точки входа/выхода, заметные конструктивные элементы.',
    '- atmosphere: стабильная атмосфера, surface language, weather/time cues, texture language, environmental character.',
    '- mutableAttributes: что можно менять при переносе в новые сцены: camera, focal length, time of day, weather intensity, set dressing, actors, action, style, color grade.',
    '- negativeConstraints: что не должно появиться или не должно измениться.',
    '- notes: дополнительные production notes для consistency, включая что лучше оставить как reference-only и где есть uncertainty.',
    cleanNotes.length ? `Connected text notes:\n${cleanNotes.join('\n\n')}` : '',
  ].filter(Boolean).join('\n\n');
}

function parseJsonObject(content: string) {
  const trimmed = content.trim();
  if (!trimmed) throw new Error('OpenRouter returned an empty location description.');

  try {
    return JSON.parse(stripJsonFence(trimmed)) as unknown;
  } catch {
    const jsonStart = trimmed.indexOf('{');
    const jsonEnd = trimmed.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
      throw new Error('OpenRouter returned location description in an unsupported format.');
    }
    return JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as unknown;
  }
}

function stripJsonFence(value: string) {
  return value.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
}
