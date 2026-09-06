import type { RuntimeCostEstimate, RuntimeUsage } from '../contracts/runtime-usage-contracts';
import { sumUsd } from './runtime-cost-decimal';

export interface RuntimeUsageCall {
  /** Stable physical call identity: generation job + dispatch attempt. */
  physicalCallId: string;
  revision: number;
  inputTokens: string | null;
  outputTokens: string | null;
  totalTokens: string | null;
  providerCostUsd: string | null;
  canReconcile: boolean;
}

export function aggregateRuntimeUsage(input: {
  calls: readonly RuntimeUsageCall[];
  terminal: boolean;
  deterministic: boolean;
  estimate?: RuntimeCostEstimate | null;
}): RuntimeUsage {
  const latest = new Map<string, RuntimeUsageCall>();
  for (const call of input.calls) {
    const prior = latest.get(call.physicalCallId);
    if (!prior || call.revision > prior.revision) latest.set(call.physicalCallId, call);
  }
  const calls = [...latest.values()];
  const priced = calls.filter((call) => call.providerCostUsd !== null);
  const noCalls = calls.length === 0;
  const provenZero = noCalls && input.deterministic && input.terminal;
  const allPriced = !noCalls && priced.length === calls.length;
  const knownCost = priced.length ? sumUsd(priced.map((call) => call.providerCostUsd!)) : null;
  const state = provenZero || (input.terminal && allPriced) ? 'COMPLETE'
    : priced.length ? 'PARTIAL'
    : !input.terminal || calls.some((call) => call.canReconcile) ? 'PENDING'
    : 'UNAVAILABLE';
  return {
    state,
    currency: 'USD',
    inputTokens: provenZero ? '0' : completeTokenSum(calls, 'inputTokens'),
    outputTokens: provenZero ? '0' : completeTokenSum(calls, 'outputTokens'),
    totalTokens: provenZero ? '0' : completeTokenSum(calls, 'totalTokens'),
    actualProviderCostUsd: provenZero ? '0.00000000' : allPriced ? knownCost : null,
    knownProviderCostUsd: provenZero ? '0.00000000' : knownCost,
    estimatedProviderCostUsd: input.estimate ?? null,
    providerCallCount: calls.length,
    pricedCallCount: priced.length,
  };
}

function completeTokenSum(calls: RuntimeUsageCall[], key: 'inputTokens' | 'outputTokens' | 'totalTokens') {
  if (calls.length === 0 || calls.some((call) => call[key] === null)) return null;
  return calls.reduce((sum, call) => sum + BigInt(call[key]!), BigInt(0)).toString();
}
