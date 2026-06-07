import { z } from 'zod';
import { formatOpenRouterError, getOpenRouterErrorStatus, sendOpenRouterChat } from '@/shared/api/openrouter';
import { DEFAULT_ANALYSIS_MODEL } from '@/shared/api/openrouter-models';

export const runtime = 'nodejs';

const subjectDescriptionSchema = z.object({
  model: z.string().min(1).default(DEFAULT_ANALYSIS_MODEL),
  subjectType: z.string().min(1).default('person'),
  imageDataUrls: z.array(z.string().min(1)).max(4).default([]),
  textNotes: z.array(z.string()).optional(),
});

const optionalString = z.preprocess((value) => (typeof value === 'string' ? value : ''), z.string());

const subjectDescriptionDraftSchema = z.object({
  identitySummary: optionalString.default(''),
  immutableTraits: optionalString.default(''),
  mutableAttributes: optionalString.default(''),
  name: optionalString.default(''),
  negativeConstraints: optionalString.default(''),
  notes: optionalString.default(''),
  subjectType: optionalString.default(''),
});

export async function POST(request: Request) {
  const parsed = subjectDescriptionSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const cleanTextNotes = (parsed.data.textNotes ?? []).map((item) => item.trim()).filter(Boolean);
  if (parsed.data.imageDataUrls.length === 0 && cleanTextNotes.length === 0) {
    return Response.json({ error: 'Attach image refs or text notes before generating a subject description.' }, { status: 400 });
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return Response.json({
      draft: {
        name: 'Reference subject',
        subjectType: parsed.data.subjectType,
        identitySummary: '[ROLE]\nMock subject identity generated from attached references.\n\n[VISUAL DESCRIPTION]\nLayered production-ready description will be generated here when OpenRouter is configured.',
        immutableTraits: 'Stable facial structure, recognizable silhouette, key proportions, and persistent visual markers from the reference set.',
        mutableAttributes: 'Clothing, pose, expression, camera angle, lighting, and scene context may adapt to the target prompt.',
        negativeConstraints: 'Do not change core identity, face proportions, key silhouette, or recognizable permanent traits.',
        notes: 'Mock response because OPENROUTER_API_KEY is not configured.',
      },
      provider: 'mock',
    });
  }

  try {
    const prompt = buildSubjectDescriptionPrompt(parsed.data.subjectType, cleanTextNotes, parsed.data.imageDataUrls.length);
    const result = await sendOpenRouterChat({
      model: parsed.data.model,
      messages: [
        {
          role: 'system',
          content: [
            'You are a senior commercial image analyst and AI image-production prompt engineer.',
            'Analyze reference images as one reusable production subject.',
            'Return only compact valid JSON. Do not wrap it in markdown.',
            'Do not identify real people by name. Do not invent brand names or logos.',
            'The identitySummary field must be a multiline layered description with explicit square-bracket headers.',
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
    const draft = subjectDescriptionDraftSchema.parse(parseJsonObject(content));

    return Response.json({
      draft,
      message: 'Subject description generated from attached sources.',
      provider: 'openrouter',
    });
  } catch (error) {
    return Response.json({
      error: formatOpenRouterError(error, 'OpenRouter subject description failed'),
    }, { status: getOpenRouterErrorStatus(error) });
  }
}

function buildSubjectDescriptionPrompt(subjectType: string, cleanNotes: string[], imageCount: number) {
  return [
    `Создай reusable Subject Builder passport из прикреплённых источников. Текущий тип субъекта, выбранный пользователем: ${subjectType}.`,
    imageCount > 0
      ? 'Считай все reference images референсами одного библиотечного субъекта, если только они явно не являются разными контекстными деталями.'
      : 'Reference images не приложены: собери паспорт только из connected text notes и явно помечай uncertainty там, где визуальных данных не хватает.',
    'Пиши на русском языке, но production terms можно оставлять на английском.',
    'Формат должен быть generation-ready: текст можно напрямую использовать как часть промпта для генерации.',
    'Разделяй стабильную идентичность и mutable scene details. Не заноси случайные пятна, шум, compression artifacts, неудачный свет, фоновые отвлечения и временные дефекты в immutable traits.',
    'Не идентифицируй реальных людей по имени. Не выдумывай бренды, логотипы, имена и биографию. Для людей описывай видимые признаки и skin tone, но не утверждай защищенную этническую принадлежность как факт.',
    'Если тип субъекта нужно исправить, set subjectType exactly one of: person, character, product, object, vehicle, animal, place.',
    'Верни строго JSON без markdown. JSON shape:',
    '{"name":"","subjectType":"","identitySummary":"","immutableTraits":"","mutableAttributes":"","negativeConstraints":"","notes":""}',
    'Field contract:',
    '- name: короткое нейтральное working ID для библиотеки, не имя реального человека.',
    '- identitySummary: главный Description библиотеки. Обязательно используй квадратные заголовки слоев, каждый с новой строки. Не возвращай comma-only summary. Если слой неизвестен, напиши Unknown / needs reference.',
    'Exact identitySummary template for person/character:',
    '[ROLE]\n...\n\n[GENDER / AGE RANGE]\n...\n\n[VISIBLE PHENOTYPE / SKIN TONE]\n...\n\n[FACE & HAIR]\n...\n\n[BODY / SILHOUETTE]\n...\n\n[WARDROBE / MUTABLE STYLING]\n...\n\n[DISTINCTIVE MARKERS]\n...\n\n[UNCERTAINTY]\n...',
    'Exact identitySummary template for object/product/place/vehicle/animal:',
    '[ROLE]\n...\n\n[FORM / SILHOUETTE]\n...\n\n[MATERIALS]\n...\n\n[SURFACE]\n...\n\n[DETAILS]\n...\n\n[SCALE]\n...\n\n[DISTINCTIVE MARKERS]\n...\n\n[UNCERTAINTY]\n...',
    '- immutableTraits: что нельзя менять без потери узнаваемости. Укажи face/proportions/silhouette/key marks/material identity/permanent design details.',
    '- mutableAttributes: что можно менять при переносе в новые сцены: clothing, pose, emotion, lighting, camera, background, styling, context.',
    '- negativeConstraints: что не должно появиться или не должно измениться.',
    '- notes: дополнительные production notes для consistency, включая что лучше оставить как reference-only и где есть uncertainty.',
    cleanNotes.length ? `Connected text notes:\n${cleanNotes.join('\n\n')}` : '',
  ].filter(Boolean).join('\n\n');
}

function parseJsonObject(content: string) {
  const trimmed = content.trim();
  if (!trimmed) throw new Error('OpenRouter returned an empty subject description.');

  try {
    return JSON.parse(stripJsonFence(trimmed)) as unknown;
  } catch {
    const jsonStart = trimmed.indexOf('{');
    const jsonEnd = trimmed.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
      throw new Error('OpenRouter returned subject description in an unsupported format.');
    }
    return JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as unknown;
  }
}

function stripJsonFence(value: string) {
  return value.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
}
