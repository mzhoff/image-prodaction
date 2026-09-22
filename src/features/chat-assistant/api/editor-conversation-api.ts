export async function loadEditorConversation({ id, workspaceId, kind, signal }: {
  id: string; workspaceId: string; kind: 'story' | 'timeline'; signal: AbortSignal;
}) {
  const path = kind === 'timeline' ? 'stories/timelines' : 'stories';
  const response = await fetch(`/api/${path}/${encodeURIComponent(id)}/conversation`, {
    signal, headers: { 'x-workspace-id': workspaceId }, cache: 'no-store',
  });
  const body = await response.json();
  if (!response.ok || (body.conversationId != null && (typeof body.conversationId !== 'string' || !body.conversationId.trim()))) {
    throw new Error('Не удалось открыть разговор. Проверьте соединение и доступ к документу.');
  }
  return body.conversationId as string | undefined;
}
