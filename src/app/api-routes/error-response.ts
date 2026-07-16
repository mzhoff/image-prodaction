import { apiError } from '@/shared/api/api-error';
import { AuthenticationRequiredError } from '@/shared/auth/session';
import { DocumentConflictError, DocumentNotFoundError } from '@/entities/document/server/document-service';
import { DocumentValidationError } from '@/entities/document/server/document-validation';
import { WorkspaceAccessError } from '@/entities/workspace/server/workspace-service';

export function toApiErrorResponse(error: unknown) {
  if (error instanceof AuthenticationRequiredError) return apiError('unauthorized', 'Authentication required.', 401);
  if (error instanceof WorkspaceAccessError) return apiError('forbidden', 'Workspace access denied.', 403);
  if (error instanceof DocumentNotFoundError) return apiError('document_not_found', 'Document not found.', 404);
  if (error instanceof DocumentConflictError) {
    return apiError('revision_conflict', 'The document changed in another session.', 409, {
      details: error.currentRevision === undefined ? undefined : { currentRevision: error.currentRevision },
    });
  }
  if (error instanceof DocumentValidationError) return apiError(error.code, error.message, 422);

  console.error('Unhandled API error', error);
  return apiError('internal_error', 'The request could not be completed.', 500);
}
