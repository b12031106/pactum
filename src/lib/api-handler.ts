import { NextResponse } from 'next/server';

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function createErrorResponse(err: unknown): {
  status: number;
  body: { error: { code: string; message: string } };
} {
  if (err instanceof ApiError) {
    return {
      status: err.statusCode,
      body: { error: { code: err.code, message: err.message } },
    };
  }
  return {
    status: 500,
    body: { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
  };
}

type ApiRouteHandler = (req: Request, context?: { params: Promise<Record<string, string>> }) => Promise<NextResponse>;

export function apiHandler(fn: ApiRouteHandler): ApiRouteHandler {
  return async (req, context) => {
    try {
      return await fn(req, context);
    } catch (err) {
      const { status, body } = createErrorResponse(err);
      if (!(err instanceof ApiError)) {
        console.error('Unhandled API error:', err);
      }
      return NextResponse.json(body, { status });
    }
  };
}
