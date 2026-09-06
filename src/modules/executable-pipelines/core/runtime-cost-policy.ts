import type { RuntimeCostSnapshot } from '../contracts/runtime-usage-contracts';
import { PipelineDomainError } from '../contracts/pipeline-errors';
import { formatUsd, strictestUsdLimit, usdUnits } from './runtime-cost-decimal';

export class RuntimeCostError extends PipelineDomainError {
  constructor(code: 'cost_estimate_unavailable' | 'cost_limit_exceeded' | 'cost_enforcement_unsupported') {
    super({ code, message: {
      cost_estimate_unavailable: 'A trusted cost estimate is unavailable for this provider call.',
      cost_limit_exceeded: 'The provider cost limit would be exceeded.',
      cost_enforcement_unsupported: 'This provider does not support a guaranteed cost bound. Strict dispatch is disabled.',
    }[code] });
    this.name = 'RuntimeCostError';
  }
}

export function prepareRuntimeCostSnapshot(input: {
  requestMaximumProviderCostUsd?: string | null;
  grantPolicy: { maximumProviderCostUsd: string | null; mode: 'STRICT' | 'BEST_EFFORT' };
  hasProviderCalls: boolean;
}): RuntimeCostSnapshot {
  const snapshot: RuntimeCostSnapshot = {
    requestMaximumProviderCostUsd: input.requestMaximumProviderCostUsd ?? null,
    grantMaximumProviderCostUsd: input.grantPolicy.maximumProviderCostUsd,
    effectiveMaximumProviderCostUsd: strictestUsdLimit(
      input.requestMaximumProviderCostUsd, input.grantPolicy.maximumProviderCostUsd,
    ),
    mode: input.grantPolicy.mode,
    hasProviderCalls: input.hasProviderCalls,
    enforcement: input.hasProviderCalls ? 'UNSUPPORTED' : 'ENFORCED',
    estimate: input.hasProviderCalls ? null : {
      min: '0.00000000', max: '0.00000000',
      pricingSnapshotId: 'deterministic:no-provider-calls:v1', confidence: 'DETERMINISTIC',
    },
  };
  if (snapshot.hasProviderCalls && snapshot.mode === 'STRICT') {
    throw new RuntimeCostError('cost_enforcement_unsupported');
  }
  return snapshot;
}

/** Trusted bounds come from a server adapter, never a run request or node config. */
export interface RuntimeTrustedCallBound {
  maximumUsd: string;
  pricingSnapshotId: string;
  guaranteed: boolean;
}

export function checkRuntimeDispatchBudget(input: {
  cost: RuntimeCostSnapshot;
  spentUsd: string;
  reservedUsd: string;
  unresolvedCalls: number;
  bound: RuntimeTrustedCallBound | null;
}) {
  const { cost, bound } = input;
  if (cost.mode === 'STRICT' && !bound?.guaranteed) {
    throw new RuntimeCostError(bound ? 'cost_enforcement_unsupported' : 'cost_estimate_unavailable');
  }
  const spent = usdUnits(input.spentUsd);
  const reserved = usdUnits(input.reservedUsd);
  const next = bound ? usdUnits(bound.maximumUsd) : BigInt(0);
  const limit = cost.effectiveMaximumProviderCostUsd;
  if (cost.mode === 'STRICT' && input.unresolvedCalls > 0) {
    throw new RuntimeCostError('cost_estimate_unavailable');
  }
  if (limit !== null && (
    spent + reserved + next > usdUnits(limit)
    || (!bound && spent + reserved >= usdUnits(limit))
  )) throw new RuntimeCostError('cost_limit_exceeded');
  return { reservedUsd: bound ? formatUsd(next) : null };
}
