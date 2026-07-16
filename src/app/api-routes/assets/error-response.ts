import { toApiErrorResponse } from '@/app/api-routes/error-response';
import {
  AssetDocumentWorkspaceMismatchError,
  AssetNotFoundError,
  AssetNotReadyError,
  AssetStorageError,
  AssetValidationError,
} from '@/entities/asset/server/asset-service';
import { apiError } from '@/shared/api/api-error';

export function toAssetApiErrorResponse(error: unknown) {
  if (error instanceof AssetNotFoundError) return apiError('asset_not_found', 'Asset not found.', 404);
  if (error instanceof AssetNotReadyError) return apiError('asset_not_ready', 'Asset content is not ready.', 409);
  if (error instanceof AssetDocumentWorkspaceMismatchError) {
    return apiError('document_workspace_mismatch', 'Document does not belong to the selected workspace.', 400);
  }
  if (error instanceof AssetStorageError) {
    return apiError('asset_storage_unavailable', 'Asset storage is temporarily unavailable.', 502);
  }
  if (error instanceof AssetValidationError) {
    const status = error.code === 'file_too_large'
      ? 413
      : ['unsupported_image', 'content_type_mismatch'].includes(error.code) ? 415 : 400;
    return apiError(error.code, error.message, status);
  }
  return toApiErrorResponse(error);
}
