import {
  NodeTemplateLimitError,
  NodeTemplateNotFoundError,
  NodeTemplateValidationError,
} from '@/entities/production-graph/server/node-template-service';
import { apiError } from '@/shared/api/api-error';
import { toApiErrorResponse } from '../error-response';

export function toNodeTemplateApiErrorResponse(error: unknown) {
  if (error instanceof NodeTemplateValidationError) {
    return apiError('invalid_node_template', error.message, 422);
  }
  if (error instanceof NodeTemplateLimitError) {
    return apiError('node_template_limit_reached', error.message, 409);
  }
  if (error instanceof NodeTemplateNotFoundError) {
    return apiError('node_template_not_found', 'Node template preset not found.', 404);
  }
  return toApiErrorResponse(error);
}
