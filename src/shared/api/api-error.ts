export interface ApiErrorBody {
  error: {
    code: string;
    details?: unknown;
    message: string;
    requestId?: string;
  };
}

export function apiError(
  code: string,
  message: string,
  status: number,
  options: { details?: unknown; requestId?: string } = {},
) {
  const body: ApiErrorBody = {
    error: {
      code,
      message,
      ...(options.details === undefined ? {} : { details: options.details }),
      ...(options.requestId ? { requestId: options.requestId } : {}),
    },
  };

  return Response.json(body, { status });
}
