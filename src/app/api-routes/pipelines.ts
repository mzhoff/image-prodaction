import { and, asc, eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { z } from 'zod';
import { auth } from '@/shared/auth/server';
import { db } from '@/shared/db/client';
import { pipeline } from '@/shared/db/schema';
import { createUuidV7, isUuidV7 } from '@/shared/lib/id';

export const runtime = 'nodejs';

type PipelineRow = typeof pipeline.$inferSelect;

export interface PipelineRouteContext {
  params: Promise<{ pipelineId: string }>;
}

const pipelinePayloadSchema = z.object({
  name: z.string().optional(),
  config: z.unknown().optional(),
});

export async function GET() {
  const session = await getApiSession();
  if (!session) return unauthorizedResponse();

  const rows = await db
    .select()
    .from(pipeline)
    .where(eq(pipeline.userId, session.user.id))
    .orderBy(asc(pipeline.createdAt));

  return Response.json({ pipelines: rows.map(serializePipeline) });
}

export async function POST(request: Request) {
  const session = await getApiSession();
  if (!session) return unauthorizedResponse();

  const parsed = pipelinePayloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const config = normalizeJsonObject(parsed.data.config);
  if (!config) {
    return Response.json({ error: 'Pipeline config must be a JSON object.' }, { status: 400 });
  }

  try {
    const [row] = await db
      .insert(pipeline)
      .values({
        id: createUuidV7(),
        userId: session.user.id,
        name: normalizePipelineName(parsed.data.name, 'Untitled pipeline'),
        config,
        updatedAt: new Date(),
      })
      .returning();

    return Response.json({ pipeline: serializePipeline(row) }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return Response.json({ error: 'Pipeline id already exists.' }, { status: 409 });
    }

    return Response.json({
      error: error instanceof Error ? error.message : 'Pipeline create failed.',
    }, { status: 500 });
  }
}

export async function PUT(request: Request, context: PipelineRouteContext) {
  const session = await getApiSession();
  if (!session) return unauthorizedResponse();

  const { pipelineId } = await context.params;
  const id = pipelineId.toLowerCase();
  if (!isUuidV7(id)) {
    return Response.json({ error: 'Pipeline id must be a UUIDv7.' }, { status: 400 });
  }

  const parsed = pipelinePayloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const config = normalizeJsonObject(parsed.data.config);
  if (!config) {
    return Response.json({ error: 'Pipeline config must be a JSON object.' }, { status: 400 });
  }

  try {
    const [row] = await db
      .update(pipeline)
      .set({
        name: normalizePipelineName(parsed.data.name, 'Untitled pipeline'),
        config,
        updatedAt: new Date(),
      })
      .where(and(eq(pipeline.id, id), eq(pipeline.userId, session.user.id)))
      .returning();

    if (!row) {
      return Response.json({ error: 'Pipeline not found.' }, { status: 404 });
    }

    return Response.json({ pipeline: serializePipeline(row) });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : 'Pipeline save failed.',
    }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: PipelineRouteContext) {
  const session = await getApiSession();
  if (!session) return unauthorizedResponse();

  const { pipelineId } = await context.params;
  const id = pipelineId.toLowerCase();
  if (!isUuidV7(id)) {
    return Response.json({ error: 'Pipeline id must be a UUIDv7.' }, { status: 400 });
  }

  const [row] = await db
    .delete(pipeline)
    .where(and(eq(pipeline.id, id), eq(pipeline.userId, session.user.id)))
    .returning({ id: pipeline.id });

  if (!row) {
    return Response.json({ error: 'Pipeline not found.' }, { status: 404 });
  }

  return Response.json({ ok: true });
}

async function getApiSession() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return session?.user.id ? session : null;
}

function unauthorizedResponse() {
  return Response.json({ error: 'Unauthorized.' }, { status: 401 });
}

function serializePipeline(row: PipelineRow) {
  return {
    id: row.id,
    name: row.name,
    userId: row.userId,
    config: row.config,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function normalizeJsonObject(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function normalizePipelineName(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback;
  const name = value.trim().replace(/\s+/g, ' ');
  return name ? name.slice(0, 80) : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUniqueViolation(error: unknown) {
  return isRecord(error) && error.code === '23505';
}
