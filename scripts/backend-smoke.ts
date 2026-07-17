import assert from 'node:assert/strict';
import { CURRENT_TERMS_VERSION } from '../src/shared/auth/terms-contract.ts';
import { waitForEmailLink } from './mailpit-client.ts';

const baseUrl = new URL(process.env.SMOKE_BASE_URL ?? 'http://localhost:3004');
const requireEmailVerification = process.env.SMOKE_REQUIRE_EMAIL_VERIFICATION === 'true';
const exerciseFakeGeneration = process.env.SMOKE_FAKE_AI_PROVIDER === 'true';
const fakeProviderCredential =
  process.env.FAKE_AI_PROVIDER_CREDENTIAL ?? 'fake-valid-credential';
const runId = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
const owner = {
  email: `smoke-owner-${runId}@example.test`,
  name: 'Backend Smoke Owner',
  password: 'SmokePass!2026',
};
const outsider = {
  email: `smoke-outsider-${runId}@example.test`,
  name: 'Backend Smoke Outsider',
  password: 'SmokePass!2026',
};
const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

const live = await requestJson('/api/health/live', { expectedStatus: 200 });
assert.equal(live.status, 'ok');
const ready = await requestJson('/api/health/ready', { expectedStatus: 200 });
assert.deepEqual(ready, {
  status: 'ready',
  checks: { database: 'ok', objectStorage: 'ok' },
});
const workerHealth = await requestJson('/api/health/worker', { expectedStatus: 200 });
assert.equal(workerHealth.status, 'healthy');
assert.equal(workerHealth.worker?.status, 'running');
assert.equal(Number.isSafeInteger(workerHealth.queue?.queued), true);
assert.equal(Number.isSafeInteger(workerHealth.queue?.running), true);

const ownerCookie = await register(owner);
const workspaces = await requestJson('/api/workspaces', {
  cookie: ownerCookie,
  expectedStatus: 200,
});
assert.equal(workspaces.workspaces.length, 1);
const workspaceId = workspaces.workspaces[0]?.id as string;
assert.ok(workspaceId);

const created = await requestJson('/api/projects', {
  cookie: ownerCookie,
  expectedStatus: 201,
  method: 'POST',
  json: { workspaceId, name: `Smoke document ${runId}` },
});
const projectId = created.project.id as string;
assert.ok(projectId);

const fetched = await requestJson(`/api/projects/${projectId}`, {
  cookie: ownerCookie,
  expectedStatus: 200,
});
assert.equal(fetched.project.revision, 0);
assert.equal(fetched.project.workspaceId, workspaceId);

const snapshot = createEmptySnapshot();
const saved = await requestJson(`/api/projects/${projectId}`, {
  cookie: ownerCookie,
  expectedStatus: 200,
  method: 'PATCH',
  json: { expectedRevision: 0, snapshot },
});
assert.equal(saved.project.revision, 1);
await requestJson(`/api/projects/${projectId}`, {
  cookie: ownerCookie,
  expectedStatus: 409,
  method: 'PATCH',
  json: { expectedRevision: 0, snapshot },
});

const libraryUploadedAsset = await uploadAsset(
  ownerCookie,
  workspaceId,
  projectId,
  `library-uploaded-${runId}.png`,
  'uploaded',
);
const librarySavedAsset = await uploadAsset(
  ownerCookie,
  workspaceId,
  projectId,
  `library-saved-${runId}.png`,
  'saved',
);
await requestBinary(`/api/assets/${libraryUploadedAsset.id}/content`, {
  cookie: ownerCookie,
  expectedStatus: 200,
  expectedBytes: onePixelPng,
});

const outsiderCookie = await register(outsider);
await requestJson(`/api/assets/${libraryUploadedAsset.id}`, {
  cookie: outsiderCookie,
  expectedStatus: 404,
});
await requestJson(`/api/assets?workspaceId=${workspaceId}`, {
  cookie: outsiderCookie,
  expectedStatus: 403,
});

const firstLibraryPage = await requestJson(
  `/api/assets?workspaceId=${workspaceId}&limit=1`,
  {
    cookie: ownerCookie,
    expectedStatus: 200,
  },
);
assert.equal(firstLibraryPage.items.length, 1);
assert.ok(firstLibraryPage.nextCursor, 'The first Library page should expose an opaque cursor.');
const secondLibraryPage = await requestJson(
  `/api/assets?workspaceId=${workspaceId}&limit=1&cursor=${encodeURIComponent(firstLibraryPage.nextCursor)}`,
  {
    cookie: ownerCookie,
    expectedStatus: 200,
  },
);
assert.equal(secondLibraryPage.items.length, 1);
assert.equal(secondLibraryPage.nextCursor, null);
assert.deepEqual(
  new Set([
    firstLibraryPage.items[0]?.id,
    secondLibraryPage.items[0]?.id,
  ]),
  new Set([libraryUploadedAsset.id, librarySavedAsset.id]),
);
assert.deepEqual(
  new Set(firstLibraryPage.facets.origins.map((facet: { value: string }) => facet.value)),
  new Set(['saved', 'uploaded']),
);
assert.deepEqual(
  firstLibraryPage.facets.mediaKinds,
  [{ count: 2, value: 'image' }],
);
assert.deepEqual(
  firstLibraryPage.facets.documents.map((facet: { id: string }) => facet.id),
  [projectId],
);

const filteredLibrary = await requestJson(
  `/api/assets?workspaceId=${workspaceId}`
    + `&origin=uploaded&mediaKind=image&documentId=${projectId}`
    + `&search=${encodeURIComponent(`library-uploaded-${runId}`)}`,
  {
    cookie: ownerCookie,
    expectedStatus: 200,
  },
);
assert.deepEqual(
  filteredLibrary.items.map((item: { id: string }) => item.id),
  [libraryUploadedAsset.id],
);
assert.equal(filteredLibrary.items[0]?.origin, 'uploaded');
assert.equal(filteredLibrary.items[0]?.mediaKind, 'image');
assert.equal(filteredLibrary.items[0]?.document?.id, projectId);

const generatedAsset = exerciseFakeGeneration
  ? await exerciseGenerationVertical(ownerCookie, workspaceId, projectId)
  : null;

await rejectUploadWithoutDurableOrigin(ownerCookie, workspaceId, projectId);
const deletedAsset = await uploadAsset(
  ownerCookie,
  workspaceId,
  projectId,
  `delete-${runId}.png`,
  'uploaded',
);
await requestEmpty(`/api/assets/${deletedAsset.id}`, {
  cookie: ownerCookie,
  expectedStatus: 204,
  method: 'DELETE',
});
await requestJson(`/api/assets/${deletedAsset.id}`, {
  cookie: ownerCookie,
  expectedStatus: 404,
});

await requestJson(`/api/projects/${projectId}`, {
  cookie: ownerCookie,
  expectedStatus: 409,
  method: 'DELETE',
});
await requestJson(`/api/projects/${projectId}`, {
  cookie: ownerCookie,
  expectedStatus: 200,
  method: 'PATCH',
  json: { status: 'trash' },
});
await requestEmpty(`/api/projects/${projectId}`, {
  cookie: ownerCookie,
  expectedStatus: 204,
  method: 'DELETE',
});
const preservedLibraryAsset = await requestJson(`/api/assets/${libraryUploadedAsset.id}`, {
  cookie: ownerCookie,
  expectedStatus: 200,
});
assert.equal(preservedLibraryAsset.asset.documentId, null);

const libraryAfterProjectDeletion = await requestJson(
  `/api/assets?workspaceId=${workspaceId}`,
  {
    cookie: ownerCookie,
    expectedStatus: 200,
  },
);
assert.deepEqual(
  new Set(libraryAfterProjectDeletion.items.map((item: { id: string }) => item.id)),
  new Set([
    libraryUploadedAsset.id,
    librarySavedAsset.id,
    ...(generatedAsset ? [generatedAsset.id] : []),
  ]),
);
assert.equal(
  libraryAfterProjectDeletion.items.every((item: { document: unknown }) => item.document === null),
  true,
);

await requestJson('/api/auth/sign-out', {
  cookie: ownerCookie,
  expectedStatus: 200,
  method: 'POST',
  json: {},
});
await requestJson('/api/projects', {
  cookie: ownerCookie,
  expectedStatus: 401,
});

console.log(`Backend smoke passed against ${baseUrl.origin}.`);

async function register(input: typeof owner) {
  const response = await request('/api/auth/sign-up/email', {
    expectedStatus: 200,
    method: 'POST',
    json: {
      ...input,
      termsAccepted: true,
      termsVersion: CURRENT_TERMS_VERSION,
    },
  });
  const registrationCookie = readResponseCookie(response);

  if (registrationCookie && !requireEmailVerification) return registrationCookie;
  if (requireEmailVerification) {
    assert.equal(
      registrationCookie,
      '',
      'Registration created a session even though mandatory email verification is enabled.',
    );
    const deniedSignIn = await request('/api/auth/sign-in/email', {
      expectedStatus: 403,
      method: 'POST',
      json: {
        email: input.email,
        password: input.password,
        rememberMe: true,
      },
    });
    assert.equal(
      readResponseCookie(deniedSignIn),
      '',
      'Unverified sign-in unexpectedly created a server session cookie.',
    );
    assert.equal(
      ((await deniedSignIn.json()) as { code?: string }).code,
      'EMAIL_NOT_VERIFIED',
    );
  }

  const verificationLink = await waitForEmailLink({
    recipient: input.email,
    subjectIncludes: 'Подтвердите email в Reverie',
    pathIncludes: '/api/auth/verify-email',
  });
  const verificationResponse = await fetch(verificationLink, {
    headers: { Origin: baseUrl.origin },
    redirect: 'manual',
  });
  assert.ok(
    verificationResponse.status >= 300 && verificationResponse.status < 400,
    `Email verification expected a redirect, got ${verificationResponse.status}.`,
  );

  const signInResponse = await request('/api/auth/sign-in/email', {
    expectedStatus: 200,
    method: 'POST',
    json: {
      email: input.email,
      password: input.password,
      rememberMe: true,
    },
  });
  const verifiedCookie = readResponseCookie(signInResponse);
  assert.ok(verifiedCookie, 'Verified sign-in did not create a server session cookie.');
  return verifiedCookie;
}

async function uploadAsset(
  cookie: string,
  workspaceId: string,
  documentId: string,
  name: string,
  origin: 'uploaded' | 'saved',
) {
  const formData = new FormData();
  formData.set('workspaceId', workspaceId);
  formData.set('documentId', documentId);
  formData.set('origin', origin);
  formData.set('file', new File([onePixelPng], name, { type: 'image/png' }));
  const payload = await requestJson('/api/assets/images', {
    body: formData,
    cookie,
    expectedStatus: 201,
    method: 'POST',
  });
  assert.equal(payload.asset.status, 'ready');
  assert.equal(payload.asset.origin, origin);
  assert.equal(payload.asset.libraryVisible, true);
  return payload.asset as { id: string };
}

async function rejectUploadWithoutDurableOrigin(
  cookie: string,
  workspaceId: string,
  documentId: string,
) {
  const formData = new FormData();
  formData.set('workspaceId', workspaceId);
  formData.set('documentId', documentId);
  formData.set('file', new File([onePixelPng], 'technical-output.png', { type: 'image/png' }));
  await requestJson('/api/assets/images', {
    body: formData,
    cookie,
    expectedStatus: 400,
    method: 'POST',
  });
}

async function exerciseGenerationVertical(
  cookie: string,
  workspaceId: string,
  documentId: string,
) {
  const connected = await requestJson(
    `/api/workspaces/${workspaceId}/providers/openrouter`,
    {
      cookie,
      expectedStatus: 201,
      method: 'POST',
      json: { apiKey: fakeProviderCredential },
    },
  );
  assert.equal(connected.provider?.provider, 'openrouter');
  assert.equal(connected.provider?.status, 'connected');

  const submitted = await requestJson('/api/ai/generate-image', {
    cookie,
    expectedStatus: 202,
    method: 'POST',
    json: {
      aspectRatio: '1:1',
      documentId,
      idempotencyKey: `backend-smoke-generation-${runId}`,
      inputs: {
        actors: [],
        actions: [],
        composition: [],
        camera: [],
        background: [],
        style: [],
        light: [],
        color: [],
        metaphor: [],
        text: [],
      },
      locationInputs: [],
      model: 'google/gemini-2.5-flash-image',
      prompt: 'A one pixel integration test image',
      referenceImages: [],
      size: '1K',
      subjectInputs: [],
      workspaceId,
    },
  });
  const jobId = submitted.job?.id as string;
  assert.ok(jobId, 'Generation submission did not return a durable job id.');

  let completed: Record<string, any> | null = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const current = await requestJson(`/api/generation-jobs/${jobId}`, {
      cookie,
      expectedStatus: 200,
    });
    if (current.job?.status === 'succeeded') {
      completed = current;
      break;
    }
    if (current.job?.status === 'failed' || current.job?.status === 'canceled') {
      throw new Error(
        `Generation ${jobId} finished unexpectedly: ${JSON.stringify(current.job)}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  assert.ok(completed, `Generation ${jobId} did not finish before the smoke timeout.`);
  assert.equal(completed.job.usage?.complete, true);
  assert.equal(completed.job.usage?.totalTokens, '15');
  assert.equal(completed.asset?.origin, 'generated');
  assert.equal(completed.asset?.libraryVisible, true);
  assert.equal(completed.asset?.documentId, documentId);
  await requestBinary(`/api/assets/${completed.asset.id}/content`, {
    cookie,
    expectedStatus: 200,
    expectedBytes: onePixelPng,
  });

  const usage = await requestJson(
    `/api/workspaces/${workspaceId}/ai-usage?periodDays=30`,
    {
      cookie,
      expectedStatus: 200,
    },
  );
  assert.equal(usage.summary?.jobs, 1);
  assert.equal(usage.summary?.totalTokens, '15');
  assert.equal(Number(usage.summary?.providerCostUsd), 0.001);

  return completed.asset as { id: string };
}

async function requestJson(path: string, options: SmokeRequestOptions) {
  const response = await request(path, options);
  const payload = await response.json().catch(() => null);
  assert.ok(payload, `${path} returned no JSON payload.`);
  return payload as Record<string, any>;
}

async function requestEmpty(path: string, options: SmokeRequestOptions) {
  const response = await request(path, options);
  assert.equal((await response.text()).length, 0, `${path} should return an empty response.`);
}

async function requestBinary(
  path: string,
  options: SmokeRequestOptions & { expectedBytes: Uint8Array },
) {
  const response = await request(path, options);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from(options.expectedBytes));
}

async function request(path: string, options: SmokeRequestOptions) {
  const headers = new Headers(options.headers);
  headers.set('Origin', baseUrl.origin);
  if (options.cookie) headers.set('Cookie', options.cookie);
  let body = options.body;
  if (options.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(options.json);
  }
  const response = await fetch(new URL(path, baseUrl), {
    body,
    headers,
    method: options.method,
    redirect: 'manual',
  });
  if (response.status !== options.expectedStatus) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`${options.method ?? 'GET'} ${path}: expected ${options.expectedStatus}, got ${response.status}. ${detail}`);
  }
  return response;
}

function createEmptySnapshot() {
  return {
    kind: 'projectSnapshot',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    project: {
      version: 1,
      nodes: [],
      sections: [],
      edges: [],
      assets: [],
      presets: [],
      subjects: [],
      locations: [],
      publications: [],
      runs: [],
      selectedNodeIds: [],
      selectedSectionIds: [],
    },
    uiState: {
      viewport: { x: 445, y: 250, zoom: 0.58 },
      nodes: {},
      sections: {},
    },
    assetsManifest: [],
  };
}

interface SmokeRequestOptions {
  body?: BodyInit;
  cookie?: string;
  expectedStatus: number;
  headers?: HeadersInit;
  json?: unknown;
  method?: string;
}

function readResponseCookie(response: Response) {
  return response.headers.getSetCookie()
    .map((value) => value.split(';', 1)[0])
    .filter(Boolean)
    .join('; ');
}
