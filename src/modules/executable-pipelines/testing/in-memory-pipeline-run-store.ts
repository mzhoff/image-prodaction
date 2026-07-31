import type {
  NewPipelineRun,
  PipelineHeartbeatResult,
  PipelineRunCompletion,
  PipelineRunJob,
  PipelineRunQueue,
  PipelineRunStore,
} from '../contracts/pipeline-contracts';

export interface InMemoryPipelineRunStore extends PipelineRunStore, PipelineRunQueue {
  getResult(runId: string): PipelineRunCompletion | null;
  list(): PipelineRunJob[];
}

export function createInMemoryPipelineRunStore(
  options: { now?: () => Date } = {},
): InMemoryPipelineRunStore {
  const now = options.now ?? (() => new Date());
  const runs = new Map<string, PipelineRunJob>();
  const results = new Map<string, PipelineRunCompletion>();

  return {
    async createOrFind(input) {
      const existing = [...runs.values()].find((run) => (
        run.workspaceId === input.workspaceId
        && run.idempotencyKey === input.idempotencyKey
      ));
      if (existing) return { created: false, run: cloneRun(existing) };

      const created = createRun(input, now());
      runs.set(created.id, created);
      return { created: true, run: cloneRun(created) };
    },

    async findById(runId) {
      const run = runs.get(runId);
      return run ? cloneRun(run) : null;
    },

    async requestCancel(input) {
      const run = runs.get(input.runId);
      if (!run) return null;
      if (run.status === 'queued' || run.status === 'failed') {
        run.status = 'canceled';
        run.cancelRequestedAt = input.requestedAt;
        run.finishedAt = input.requestedAt;
        run.retryable = false;
        run.retryAvailableAt = null;
        run.leaseExpiresAt = null;
      } else if (run.status === 'running' && !run.cancelRequestedAt) {
        run.cancelRequestedAt = input.requestedAt;
      }
      return cloneRun(run);
    },

    async claimNext(input) {
      closeExpiredRuns(runs, input.claimedAt);
      const candidate = [...runs.values()]
        .filter((run) => isClaimable(run, input.claimedAt))
        .sort(compareRuns)[0];
      if (!candidate) return null;

      candidate.status = 'running';
      candidate.attemptCount += 1;
      candidate.startedAt ??= input.claimedAt;
      candidate.finishedAt = null;
      candidate.leaseExpiresAt = input.leaseExpiresAt;
      candidate.retryAvailableAt = null;
      candidate.retryable = null;
      candidate.errorCode = null;
      candidate.errorMessage = null;
      return cloneRun(candidate);
    },

    async heartbeat(input): Promise<PipelineHeartbeatResult> {
      const run = runs.get(input.runId);
      if (!ownsAttempt(run, input.attemptCount, input.heartbeatAt)) return 'lost';
      if (run.cancelRequestedAt) return 'canceled';
      run.leaseExpiresAt = input.leaseExpiresAt;
      return 'renewed';
    },

    async succeed(input) {
      const run = runs.get(input.runId);
      if (!ownsAttempt(run, input.attemptCount, input.completedAt)) return false;
      if (run.cancelRequestedAt) {
        markCanceled(run, input.completedAt);
        return true;
      }
      run.status = 'succeeded';
      run.finishedAt = input.completedAt;
      run.leaseExpiresAt = null;
      run.retryable = false;
      results.set(run.id, structuredClone(input.result));
      return true;
    },

    async fail(input) {
      const run = runs.get(input.runId);
      if (!ownsAttempt(run, input.attemptCount, input.failedAt)) return false;
      if (run.cancelRequestedAt) {
        markCanceled(run, input.failedAt);
        return true;
      }
      run.status = 'failed';
      run.errorCode = input.errorCode;
      run.errorMessage = input.errorMessage;
      run.finishedAt = input.failedAt;
      run.leaseExpiresAt = null;
      run.retryable = input.retryable;
      run.retryAvailableAt = input.retryable ? input.retryAvailableAt : null;
      return true;
    },

    async cancel(input) {
      const run = runs.get(input.runId);
      if (!run || run.status !== 'running' || run.attemptCount !== input.attemptCount) {
        return false;
      }
      markCanceled(run, input.canceledAt);
      return true;
    },

    getResult(runId) {
      const result = results.get(runId);
      return result ? structuredClone(result) : null;
    },

    list() {
      return [...runs.values()].sort(compareRuns).map(cloneRun);
    },
  };
}

function createRun(input: NewPipelineRun, createdAt: Date): PipelineRunJob {
  return {
    id: input.id,
    workspaceId: input.workspaceId,
    pipelineId: input.pipelineId,
    pipelineVersion: input.pipelineVersion,
    sourceApplication: input.sourceApplication,
    idempotencyKey: input.idempotencyKey,
    requestFingerprint: input.requestFingerprint,
    input: structuredClone(input.input),
    status: 'queued',
    attemptCount: 0,
    maxAttempts: input.maxAttempts,
    leaseExpiresAt: null,
    retryAvailableAt: null,
    retryable: null,
    cancelRequestedAt: null,
    errorCode: null,
    errorMessage: null,
    createdAt,
    startedAt: null,
    finishedAt: null,
  };
}

function closeExpiredRuns(runs: Map<string, PipelineRunJob>, at: Date) {
  for (const run of runs.values()) {
    if (run.status !== 'running' || !isExpired(run.leaseExpiresAt, at)) continue;
    if (run.cancelRequestedAt) {
      markCanceled(run, at);
      continue;
    }
    if (run.attemptCount >= run.maxAttempts) {
      run.status = 'failed';
      run.retryable = false;
      run.errorCode = 'pipeline_max_attempts_exhausted';
      run.errorMessage = 'Pipeline run lease expired after the final attempt.';
      run.leaseExpiresAt = null;
      run.finishedAt = at;
    }
  }
}

function isClaimable(run: PipelineRunJob, at: Date) {
  if (run.cancelRequestedAt || run.attemptCount >= run.maxAttempts) return false;
  if (run.status === 'queued') return true;
  if (run.status === 'failed') {
    return run.retryable === true
      && (!run.retryAvailableAt || run.retryAvailableAt.getTime() <= at.getTime());
  }
  return run.status === 'running' && isExpired(run.leaseExpiresAt, at);
}

function ownsAttempt(
  run: PipelineRunJob | undefined,
  attemptCount: number,
  at: Date,
): run is PipelineRunJob {
  return Boolean(
    run
    && run.status === 'running'
    && run.attemptCount === attemptCount
    && run.leaseExpiresAt
    && run.leaseExpiresAt.getTime() > at.getTime(),
  );
}

function isExpired(leaseExpiresAt: Date | null, at: Date) {
  return !leaseExpiresAt || leaseExpiresAt.getTime() <= at.getTime();
}

function markCanceled(run: PipelineRunJob, at: Date) {
  run.status = 'canceled';
  run.cancelRequestedAt ??= at;
  run.finishedAt = at;
  run.leaseExpiresAt = null;
  run.retryAvailableAt = null;
  run.retryable = false;
  run.errorCode = 'pipeline_aborted';
  run.errorMessage = 'Pipeline run was canceled.';
}

function compareRuns(left: PipelineRunJob, right: PipelineRunJob) {
  return left.createdAt.getTime() - right.createdAt.getTime()
    || left.id.localeCompare(right.id);
}

function cloneRun(run: PipelineRunJob): PipelineRunJob {
  return structuredClone(run);
}
