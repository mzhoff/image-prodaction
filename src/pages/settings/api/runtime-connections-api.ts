import { z } from 'zod';
import {
  runtimeV2ClientSchema, runtimeV2CredentialSchema,
  type RuntimeV2CreateClient, type RuntimeV2IssueCredential,
  type RuntimeV2CreateGrant, type RuntimeV2Repin,
} from '@/modules/executable-pipelines/contracts/runtime-v2-contracts';
import {
  runtimeV2GrantSchema, runtimeV2PipelineSchema, runtimeV2UpdatesSchema, runtimeV2VersionSchema,
} from '@/modules/executable-pipelines/contracts/runtime-v2-descriptor-contracts';
import { runtimeV2RunSchema, type RuntimeV2RunRequest } from '@/modules/executable-pipelines/contracts/runtime-v2-run-contracts';

const clientsSchema = z.object({ clients: z.array(runtimeV2ClientSchema) });
const clientSchema = z.object({ client: runtimeV2ClientSchema });
const detailsSchema = z.object({
  client: runtimeV2ClientSchema,
  credentials: z.array(runtimeV2CredentialSchema),
  grants: z.array(runtimeV2GrantSchema),
});
const issuedSchema = z.object({ credential: runtimeV2CredentialSchema, token: z.string().min(1) });
const pipelinesSchema = z.object({ pipelines: z.array(runtimeV2PipelineSchema) });
const versionsSchema = z.object({ versions: z.array(runtimeV2VersionSchema) });
const grantSchema = z.object({ grant: runtimeV2GrantSchema });
const updatesSchema = z.object({ updates: runtimeV2UpdatesSchema });
const runSchema = z.object({ run: runtimeV2RunSchema });

export type RuntimeConnectionDetails = z.infer<typeof detailsSchema>;
export type IssuedRuntimeCredential = z.infer<typeof issuedSchema>;

export class RuntimeConnectionsApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string) {
    super(errorMessage(status, code));
    this.name = 'RuntimeConnectionsApiError';
    this.status = status;
    this.code = code;
  }
}

export function createRuntimeConnectionsApi(fetcher: typeof fetch = fetch) {
  async function request<T>(
    workspaceId: string, path: string, schema: z.ZodType<T> | null,
    init: RequestInit = {},
  ): Promise<T> {
    const response = await fetcher(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/runtime-connections${path}`,
      { ...init, credentials: 'same-origin', cache: 'no-store', redirect: 'error' },
    );
    if (!response.ok) {
      const payload: unknown = await response.json().catch(() => null);
      const parsed = z.object({ error: z.object({ code: z.string() }) }).safeParse(payload);
      // Never surface an upstream message: it may echo a credential or user input.
      const code = parsed.success ? parsed.data.error.code : 'runtime_connection_failed';
      throw new RuntimeConnectionsApiError(response.status, code);
    }
    if (!schema) return undefined as T;
    const parsed = schema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw new RuntimeConnectionsApiError(502, 'invalid_response');
    return parsed.data;
  }
  function json(method: string, body: unknown): RequestInit {
    return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  }
  const clientPath = (clientId: string) => `/clients/${encodeURIComponent(clientId)}`;
  const grantPath = (clientId: string, grantId: string) => `${clientPath(clientId)}/grants/${encodeURIComponent(grantId)}`;
  return {
    listClients: (workspace: string, signal?: AbortSignal) =>
      request(workspace, '/clients', clientsSchema, { signal }),
    createClient: (workspace: string, input: RuntimeV2CreateClient) =>
      request(workspace, '/clients', clientSchema, json('POST', input)),
    getClient: (workspace: string, client: string, signal?: AbortSignal) =>
      request(workspace, clientPath(client), detailsSchema, { signal }),
    setClientEnabled: (workspace: string, client: string, enabled: boolean) =>
      request(workspace, clientPath(client), clientSchema, json('PATCH', { enabled })),
    issueCredential: (workspace: string, client: string, input: RuntimeV2IssueCredential) =>
      request(workspace, `${clientPath(client)}/credentials`, issuedSchema, json('POST', input)),
    revokeCredential: (workspace: string, client: string, credential: string) =>
      request(workspace, `${clientPath(client)}/credentials/${encodeURIComponent(credential)}/revoke`,
        null, json('POST', {})),
    listPipelines: (workspace: string, signal?: AbortSignal) =>
      request(workspace, '/pipelines', pipelinesSchema, { signal }),
    listVersions: (workspace: string, publicId: string, signal?: AbortSignal) =>
      request(workspace, `/pipelines/${encodeURIComponent(publicId)}/versions`, versionsSchema, { signal }),
    createGrant: (workspace: string, client: string, input: RuntimeV2CreateGrant) =>
      request(workspace, `${clientPath(client)}/grants`, grantSchema, json('POST', input)),
    setGrantEnabled: (workspace: string, client: string, grant: string, enabled: boolean, expectedGrantRevision: number) =>
      request(workspace, grantPath(client, grant), grantSchema, json('PATCH', { enabled, expectedGrantRevision })),
    getUpdates: (workspace: string, client: string, grant: string, signal?: AbortSignal) =>
      request(workspace, `${grantPath(client, grant)}/updates`, updatesSchema, { signal }),
    repin: (workspace: string, client: string, grant: string, input: RuntimeV2Repin) =>
      request(workspace, `${grantPath(client, grant)}/repin`, grantSchema, json('POST', input)),
    rollback: (workspace: string, client: string, grant: string, input: RuntimeV2Repin) =>
      request(workspace, `${grantPath(client, grant)}/rollback`, grantSchema, json('POST', input)),
    createRun: (workspace: string, client: string, grant: string, input: RuntimeV2RunRequest, idempotencyKey: string) =>
      request(workspace, `${grantPath(client, grant)}/runs`, runSchema, {
        ...json('POST', input), headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      }),
    getRun: (workspace: string, client: string, runId: string, signal?: AbortSignal) =>
      request(workspace, `${clientPath(client)}/runs/${encodeURIComponent(runId)}`, runSchema, { signal }),
    cancelRun: (workspace: string, client: string, runId: string) =>
      request(workspace, `${clientPath(client)}/runs/${encodeURIComponent(runId)}/cancel`, runSchema, json('POST', {})),
  };
}

function errorMessage(status: number, code: string) {
  if (status === 401) return 'Сессия завершилась. Войдите в аккаунт ещё раз.';
  if (status === 403) return 'Управлять подключениями могут владелец и администраторы Workspace.';
  if (status === 404) return 'Подключение или опубликованный pipeline больше недоступны. Обновите список.';
  if (code === 'capability_missing') return 'У опубликованной версии не указано назначение. Добавьте capability и опубликуйте новую версию.';
  if (code === 'incompatible_repin') return 'Контракт новой версии несовместим. Текущая версия сохранена.';
  if (code === 'cost_enforcement_unsupported') return 'Для этого провайдера нельзя гарантировать жёсткий лимит расходов.';
  if (status === 409) return 'Состояние изменилось. Обновите данные и проверьте версию перед повторным действием.';
  if (status === 429) return 'Слишком много запросов. Повторите немного позже.';
  if (status >= 500) return 'Не удалось получить ответ сервиса. Обновите список перед повторной выдачей ключа.';
  return 'Не удалось выполнить действие. Проверьте поля и повторите попытку.';
}

export const runtimeConnectionsApi = createRuntimeConnectionsApi();
