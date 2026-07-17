import { z } from 'zod';
import { DEFAULT_ANALYSIS_MODEL } from '@/shared/api/openrouter-models';
import {
  executeShortOpenRouterChat,
  getProviderText,
  shortAiScopeSchema,
  toShortAiApiErrorResponse,
} from './short-ai-execution';

export const runtime = 'nodejs';

const locationDescriptionSchema = z.object({
  ...shortAiScopeSchema.shape,
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
  const parsed = locationDescriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const cleanTextNotes = (parsed.data.textNotes ?? []).map((item) => item.trim()).filter(Boolean);
  if (parsed.data.imageDataUrls.length === 0 && cleanTextNotes.length === 0) {
    return Response.json({ error: 'Attach image refs or text notes before generating a location description.' }, { status: 400 });
  }

  try {
    const prompt = buildLocationDescriptionPrompt(parsed.data.locationType, cleanTextNotes, parsed.data.imageDataUrls.length);
    const execution = await executeShortOpenRouterChat({
      request,
      scope: parsed.data,
      providerRequest: {
        modelId: parsed.data.model,
        operation: 'describe_location',
        expectedOutputModalities: ['text'],
        messages: [
        {
          role: 'system',
          parts: [{
            modality: 'text',
            text: [
            'You are a senior commercial image analyst and AI image-production prompt engineer.',
            'Analyze reference images as one reusable production location or environment.',
            'Return only compact valid JSON. Do not wrap it in markdown.',
            'Do not invent brand names, exact addresses, logos, or real-world claims not visible in the image.',
            'The description field must be a multiline layered description with explicit square-bracket headers.',
          ].join(' '),
          }],
        },
        {
          role: 'user',
          parts: [
            { modality: 'text', text: prompt },
            ...parsed.data.imageDataUrls.map((url) => ({ modality: 'image' as const, url })),
          ],
        },
        ],
        parameters: {
          maxOutputTokens: 2200,
          temperature: 0.25,
        },
      },
      transform: (result) => ({
        draft: locationDescriptionDraftSchema.parse(parseJsonObject(getProviderText(result))),
      }),
    });

    return Response.json({
      ...execution.result,
      job: execution.job,
      message: 'Location description generated from attached sources.',
      provider: 'openrouter',
    });
  } catch (error) {
    return toShortAiApiErrorResponse(error);
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
