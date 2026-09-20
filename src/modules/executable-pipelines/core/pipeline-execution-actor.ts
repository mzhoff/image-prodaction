import { PipelineDomainError } from '../contracts/pipeline-errors';
/** Only the persisted server-authenticated initiator may override the service execution actor. */
export function pipelineExecutionActor(record: {
  initiatorType: string; initiatorId: string | null; sourceApplication: string;
} | undefined, publisherId: string) {
  if (record && ['workspace-user', 'runtime-session-test'].includes(record.initiatorType)) {
    if (record.initiatorId) return record.initiatorId;
    throw missingActor();
  }
  if (record?.sourceApplication === 'image-production-playground') throw missingActor();
  return publisherId;
}
function missingActor() {
  return new PipelineDomainError({ code: 'pipeline_initiator_required', message: 'Автор запуска не сохранён. Создайте новый запуск из своего аккаунта.' });
}
