import {
  FavoriteNodeLimitError,
  FavoriteNodeNotFoundError,
  FavoriteNodeValidationError,
} from '@/entities/production-graph/server/favorite-node-service';
import { apiError } from '@/shared/api/api-error';
import { toApiErrorResponse } from '../error-response';

export function toFavoriteNodeApiErrorResponse(error: unknown) {
  if (error instanceof FavoriteNodeValidationError) {
    return apiError('invalid_favorite_node', error.message, 422);
  }
  if (error instanceof FavoriteNodeLimitError) {
    return apiError('favorite_node_limit_reached', error.message, 409);
  }
  if (error instanceof FavoriteNodeNotFoundError) {
    return apiError('favorite_node_not_found', 'Favorite node preset not found.', 404);
  }
  return toApiErrorResponse(error);
}
