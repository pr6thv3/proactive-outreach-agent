import { NextResponse } from 'next/server';
import { ApiAuthError } from '@/lib/auth/context';
import { generateTraceId } from '@/lib/agents/infrastructure/observability';

export interface ApiOk<T> {
  success: true;
  data: T;
  traceId: string;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
  };
  traceId: string;
}

export function createTraceId(traceId?: string): string {
  return traceId || generateTraceId();
}

export function ok<T>(data: T, traceId = createTraceId(), status = 200): NextResponse<ApiOk<T>> {
  return NextResponse.json({ success: true, data, traceId }, { status });
}

export function fail(message: string, status = 400, code = 'bad_request', traceId = createTraceId()): NextResponse<ApiError> {
  return NextResponse.json({ success: false, error: { code, message }, traceId }, { status });
}

export function badRequest(message = 'Bad request', traceId = createTraceId()): NextResponse<ApiError> {
  return fail(message, 400, 'bad_request', traceId);
}

export function notFound(message = 'Resource not found', traceId = createTraceId()): NextResponse<ApiError> {
  return fail(message, 404, 'not_found', traceId);
}

export function handleApiError(error: unknown, traceId = createTraceId()): NextResponse<ApiError> {
  if (error instanceof ApiAuthError) {
    const status = (error as any).statusCode || (error as any).status || 401;
    return fail(error.message, status, status === 401 ? 'unauthenticated' : 'forbidden', traceId);
  }

  if (error instanceof Error && error.name === 'ZodError') {
    return fail('Invalid request payload', 400, 'validation_error', traceId);
  }

  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : error instanceof Error
      ? error.message
      : 'Internal server error';

  return fail(message, 500, 'internal_error', traceId);
}
