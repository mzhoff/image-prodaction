import type { CompiledPipelinePlan } from '../contracts/pipeline-contracts';
import { PRODUCTION_PIPELINE_NODE_MANIFEST } from './pipeline-production-manifest';
export { prepareRuntimeCostSnapshot } from '../core/runtime-cost-policy';

export function hasProviderCalls(plan: CompiledPipelinePlan) {
  return plan.definition.nodes.some((node) => {
    const handler = PRODUCTION_PIPELINE_NODE_MANIFEST.find((entry) => (
      entry.handlerType === node.handlerType && entry.handlerVersion === node.handlerVersion
    ));
    // Unknown handlers cannot qualify for an asserted zero cost.
    return !handler || handler.paid || !handler.deterministic;
  });
}
