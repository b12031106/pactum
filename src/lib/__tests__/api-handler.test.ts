import { describe, it, expect } from 'vitest';
import { ApiError, createErrorResponse } from '@/lib/api-handler';

describe('ApiError', () => {
  it('creates error with statusCode, code, and message', () => {
    const err = new ApiError(404, 'NOT_FOUND', 'Document not found');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('Document not found');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('createErrorResponse', () => {
  it('formats ApiError into standard error JSON', () => {
    const err = new ApiError(409, 'DOCUMENT_LOCKED', 'Alice is editing');
    const result = createErrorResponse(err);
    expect(result).toEqual({
      status: 409,
      body: { error: { code: 'DOCUMENT_LOCKED', message: 'Alice is editing' } },
    });
  });

  it('formats unknown errors as 500 INTERNAL_ERROR', () => {
    const err = new Error('something broke');
    const result = createErrorResponse(err);
    expect(result).toEqual({
      status: 500,
      body: { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
    });
  });
});
