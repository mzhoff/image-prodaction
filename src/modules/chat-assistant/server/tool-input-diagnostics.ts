import { pipelineBuildInputSchema } from '../core/pipeline-build';
import { pipelineUpdateInputSchema } from '../core/pipeline-update';

interface ToolResultForDiagnostics {
  toolCallIssues?: readonly unknown[];
  toolCalls: ReadonlyArray<{ input: unknown; name: string }>;
}

export interface SafeToolInputDiagnostic {
  issues: Array<{ code: string; path: string }>;
  toolName: string;
}

export function collectSafeToolInputDiagnostics(
  result: ToolResultForDiagnostics,
): SafeToolInputDiagnostic[] {
  const diagnostics: SafeToolInputDiagnostic[] = [];
  if (result.toolCallIssues?.length) {
    diagnostics.push({ issues: [{ code: 'malformed-json', path: '/' }], toolName: 'provider' });
  }
  for (const toolCall of result.toolCalls) {
    const schema = toolCall.name === 'pipeline_build'
      ? pipelineBuildInputSchema
      : toolCall.name === 'pipeline_update'
        ? pipelineUpdateInputSchema
        : undefined;
    if (!schema) continue;
    const parsed = schema.safeParse(toolCall.input);
    if (parsed.success) continue;
    diagnostics.push({
      issues: deduplicateIssues(parsed.error.issues.map((issue) => ({
        code: toSafeIssueCode(issue.code),
        path: toSafePath(issue.path),
      }))),
      toolName: toolCall.name,
    });
  }
  return diagnostics;
}

function deduplicateIssues(issues: Array<{ code: string; path: string }>) {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.code}:${issue.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
}

function toSafeIssueCode(code: string) {
  if (code === 'invalid_type') return 'type';
  if (code === 'unrecognized_keys') return 'additional-property';
  if (code === 'invalid_value') return 'enum';
  if (code === 'invalid_format') return 'format';
  return 'constraint';
}

function toSafePath(path: PropertyKey[]) {
  const safe = path.slice(0, 12).flatMap((segment) => {
    if (typeof segment === 'number') return [String(segment)];
    if (typeof segment !== 'string' || !segment || segment.length > 80) return [];
    return [...segment].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    }) ? [] : [segment];
  });
  const result = `/${safe.map((segment) => segment.replace(/~/g, '~0').replace(/\//g, '~1')).join('/')}`;
  return result.length <= 256 ? result : '/';
}
