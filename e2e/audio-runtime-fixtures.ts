import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { CURRENT_TERMS_VERSION } from '../src/shared/auth/terms-contract';
import { PROJECT_SCHEMA_VERSION, type ProjectExport } from '../src/entities/production-graph/model/project-schema';
import { waitForEmailLink } from '../scripts/mailpit-client';
import type { OnboardingState } from '../src/shared/onboarding/contract';
import { completedQaOnboarding } from './release-user-fixture';
import type { AssetDto } from '../src/entities/asset/server/asset-service-contracts';

export const audioQaCapability = 'qa.audio.convert';

/** Native fetch keeps secrets outside Playwright request/trace diagnostics. */
export class AudioQaHttp {
  private readonly cookies = new Map<string, string>();
  private readonly clientIp = `10.${[...randomBytes(3)].join('.')}`;
  constructor(readonly origin: string, private readonly token?: string) {}

  /** Test-only transfer into the matching local browser context; never log the result. */
  browserSessionCookies() {
    return [
      ...[...this.cookies].map(([name, value]) => ({ name, value, url: this.origin, httpOnly: true, sameSite: 'Lax' as const })),
      // The API questionnaire chooses Russian; mirror that preference in its browser.
      { name: 'production_locale', value: 'ru', url: this.origin, httpOnly: false, sameSite: 'Lax' as const },
    ];
  }

  async request(path: string, options: { method?: string; json?: unknown; form?: FormData; key?: string; accountId?: string } = {}) {
    if (!path.startsWith('/') || path.startsWith('//')) throw new Error('QA requests must use a local relative path.');
    const headers = new Headers({ origin: this.origin });
    // Independent QA users must not share the five-signups/minute production bucket.
    const target = new URL(this.origin);
    if (target.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(target.hostname)) {
      headers.set('x-forwarded-for', this.clientIp);
    }
    if (this.token) headers.set('authorization', `Bearer ${this.token}`);
    else if (this.cookies.size) headers.set('cookie', [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; '));
    if (options.key) headers.set('idempotency-key', options.key);
    if (options.accountId) headers.set('x-account-id', options.accountId);
    if (options.json !== undefined) headers.set('content-type', 'application/json');
    let response: Response;
    try {
      response = await fetch(`${this.origin}${path}`, {
        method: options.method ?? (options.json !== undefined || options.form ? 'POST' : 'GET'),
        headers, redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(30_000),
        body: options.form ?? (options.json === undefined ? undefined : JSON.stringify(options.json)),
      });
    } catch { throw new Error('Local audio QA HTTP request failed; request credentials were omitted.'); }
    if (!this.token) for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';', 1)[0]!;
      const separator = pair.indexOf('=');
      if (separator > 0) this.cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
    return response;
  }
}

/** New media is usable only after the durable ingest job finishes, not after its 202 acceptance. */
export async function awaitQaAssetIngest(http: AudioQaHttp, response: Pick<Response, 'status' | 'json'>): Promise<{ asset: AssetDto }> {
  const accepted = await parseQaJson(response, 202, z.object({
    asset: z.object({ id: z.uuid(), status: z.literal('pending') }),
    job: z.object({ id: z.uuid() }), statusUrl: z.string(),
  }));
  const path = `/api/generation-jobs/${accepted.job.id}`;
  if (accepted.statusUrl !== path) throw new Error('Upload returned an invalid local job URL.');
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const current = await http.request(path);
    if (current.status !== 200) throw new Error(`Upload job lookup returned HTTP ${current.status}.`);
    const payload = await current.json() as {
      job?: { id?: string; status?: string; error?: { retryable?: boolean } }; asset?: AssetDto;
    };
    if (payload.job?.id !== accepted.job.id) throw new Error('Upload job identity changed.');
    if (payload.job.status === 'succeeded') {
      if (payload.asset?.id !== accepted.asset.id || payload.asset.status !== 'ready') {
        throw new Error('Completed upload did not return its ready asset.');
      }
      return { asset: payload.asset };
    }
    if (payload.job.status === 'canceled' || (payload.job.status === 'failed' && !payload.job.error?.retryable)) {
      throw new Error('Synthetic asset processing failed; response body omitted.');
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Synthetic asset processing did not finish within 60 seconds.');
}

export async function parseQaJson<T>(response: Pick<Response, 'status' | 'json'>, expected: number | number[], schema: z.ZodType<T>): Promise<T> {
  const accepted = Array.isArray(expected) ? expected : [expected];
  if (!accepted.includes(response.status)) {
    throw new Error(`Audio QA expected HTTP ${accepted.join('/')} but received ${response.status}; body omitted.`);
  }
  const parsed = schema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new Error('Audio QA received an invalid response contract; body omitted.');
  return parsed.data;
}

export async function createAudioQaOwner(origin: string, label: string) {
  const target = new URL(origin);
  if (target.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(target.hostname)) {
    throw new Error('Audio QA application must be loopback-only.');
  }
  const http = new AudioQaHttp(origin);
  const email = `audio-runtime-${randomBytes(8).toString('hex')}@example.test`;
  const password = `${randomBytes(20).toString('base64url')}!Aa1`;
  const signup = await http.request('/api/auth/sign-up/email', { json: {
    name: `Audio Runtime QA ${label}`, email, password, termsAccepted: true, termsVersion: CURRENT_TERMS_VERSION,
  } });
  if (![200, 201].includes(signup.status)) throw new Error(`Audio QA signup failed with HTTP ${signup.status}; credentials omitted.`);
  let spaces = await http.request('/api/workspaces');
  if (spaces.status === 401) {
    // Support the normal local email-verification flow without changing auth policy.
    const mailpit = new URL(process.env.MAILPIT_HTTP_URL ?? 'http://localhost:8025');
    if (mailpit.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(mailpit.hostname)) throw new Error('Audio QA Mailpit must be loopback-only.');
    const link = new URL(await waitForEmailLink({ mailpitUrl: mailpit.origin, recipient: email,
      subjectIncludes: 'Подтвердите email', pathIncludes: '/api/auth/verify-email' }));
    if (link.protocol !== target.protocol || !['localhost', '127.0.0.1'].includes(link.hostname) || link.port !== target.port
      || link.pathname !== '/api/auth/verify-email') throw new Error('Audio QA verification link is not the local application.');
    const verification = await http.request(`${link.pathname}${link.search}`);
    if (![200, 302, 303, 307].includes(verification.status)) throw new Error('Audio QA email verification failed.');
    spaces = await http.request('/api/workspaces');
  }
  const payload = await parseQaJson(spaces, 200, z.object({ workspaces: z.array(z.object({ id: z.uuid() })).min(1) }));
  const questionnaire = await http.request('/api/account/onboarding');
  if (questionnaire.status !== 200) throw new Error('Audio QA could not read the required onboarding.');
  const state = await questionnaire.json() as OnboardingState;
  if (!state.userId || !Number.isInteger(state.revision) || state.completedAt !== null || state.legacyExempt) {
    throw new Error('Audio QA expected a new account with an incomplete questionnaire.');
  }
  const completed = await http.request('/api/account/onboarding', {
    method: 'PATCH', accountId: state.userId, json: completedQaOnboarding(state),
  });
  await parseQaJson(completed, 200, z.object({
    userId: z.literal(state.userId), completedAt: z.string().min(1), legacyExempt: z.literal(false),
  }));
  return { http, workspaceId: payload.workspaces[0]!.id };
}

export function audioQaForm(bytes: Uint8Array, workspaceId?: string, image = false) {
  const form = new FormData();
  form.set('file', new Blob([new Uint8Array(bytes)], { type: image ? 'image/png' : 'audio/wav' }), image ? 'audio-qa-pixel.png' : 'audio-qa-tone.wav');
  if (workspaceId) { form.set('workspaceId', workspaceId); form.set('origin', 'uploaded'); }
  return form;
}

/** A synthetic 0.5 s mono tone, never a recording of a real person. */
export function createAudioQaWave(frequency = 440) {
  const samples = 4000;
  const bytes = Buffer.alloc(44 + samples * 2);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28);
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index += 1) bytes.writeInt16LE(Math.round(Math.sin(index * frequency * Math.PI * 2 / 8000) * 8000), 44 + index * 2);
  return bytes;
}

export function createAudioQaSnapshot(): ProjectExport {
  return {
    kind: 'projectSnapshot', schemaVersion: PROJECT_SCHEMA_VERSION, exportedAt: new Date().toISOString(),
    assetsManifest: [], uiState: { nodes: {}, sections: {}, viewport: { x: 0, y: 0, zoom: 1 } },
    project: {
      version: PROJECT_SCHEMA_VERSION,
      nodes: [
        { id: 'input', type: 'pipelineInput', data: { title: 'Input', fields: [{ id: 'recording', key: 'recording', kind: 'audio', required: true }] },
          position: { x: 50, y: 100 }, size: { width: 280, height: 300 }, status: 'idle' },
        { id: 'convert', type: 'audioConvert', data: { title: 'Audio Convert', format: 'mp3', bitrateKbps: 128, sampleRateHz: 16000, channels: 1 },
          position: { x: 450, y: 100 }, size: { width: 280, height: 400 }, status: 'idle' },
        { id: 'output', type: 'pipelineOutput', data: { title: 'Output', fields: [{ id: 'result', key: 'result', kind: 'audio', required: true }] },
          position: { x: 850, y: 100 }, size: { width: 280, height: 300 }, status: 'idle' },
      ],
      edges: [
        { id: 'input-convert', sourceNodeId: 'input', sourcePortId: 'field:recording', targetNodeId: 'convert', targetPortId: 'source' },
        { id: 'convert-output', sourceNodeId: 'convert', sourcePortId: 'audio', targetNodeId: 'output', targetPortId: 'field:result' },
      ],
      sections: [{ id: 'audio-qa', title: 'Audio Runtime QA — MP3', capabilityKey: audioQaCapability,
        position: { x: 0, y: 0 }, size: { width: 1300, height: 700 } }],
      assets: [], presets: [], subjects: [], locations: [], publications: [], runs: [], selectedNodeIds: [], selectedSectionIds: [],
    },
  };
}
