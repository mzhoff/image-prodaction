import { handleRuntimeV2 } from '@/modules/executable-pipelines/server/runtime-v2-api';

export const runtime = 'nodejs';
type Context = { params: Promise<{ path: string[] }> };
async function handle(request: Request, context: Context) {
  return handleRuntimeV2(request, (await context.params).path);
}
export { handle as GET, handle as POST, handle as PATCH };
