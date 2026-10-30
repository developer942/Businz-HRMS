import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { PayrollConfigurationError } from '../services/calculationEngine.js';

export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (err instanceof PayrollConfigurationError) {
    res.status(422).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(422).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request payload validation failed',
        details: err.issues.map(i => ({
          field: i.path.join('.'),
          message: i.message,
        })),
      },
    });
    return;
  }

  if (err instanceof Error) {
    const typed = err as Error & {
      statusCode?: number;
      code?: string;
      currentVersion?: number;
      conflictingFields?: unknown[];
      latestEmployee?: Record<string, unknown>;
    };
    const rawMessage = err.message || 'An unexpected error occurred';
    const isPostgresError =
      (typeof typed.code === 'string' && /^[0-9A-Z]{5}$/.test(typed.code)) ||
      /could not create unique index|unique constraint|idx_|uq_|violates|relation .* does not exist|column .* does not exist|syntax error at or near/i.test(
        rawMessage
      );

    if (isPostgresError) {
      console.error('[DatabaseError]', { code: typed.code, message: rawMessage });
      const isUniqueViolation = typed.code === '23505' || /unique constraint|unique index/i.test(rawMessage);
      res.status(isUniqueViolation ? 409 : 500).json({
        success: false,
        error: {
          code: isUniqueViolation ? 'DUPLICATE_RECORD_CONFLICT' : 'DATABASE_OPERATION_FAILED',
          message: isUniqueViolation
            ? 'This attendance or record update has already been saved. Please refresh and check your status.'
            : 'Unable to complete the database operation right now. Please try again.',
          details: [],
        },
      });
      return;
    }

    const isNotFound = rawMessage.toLowerCase().includes('not found');
    const isConflict = rawMessage.toLowerCase().includes('already exists');
    const statusCode = typed.statusCode || (isNotFound ? 404 : isConflict ? 409 : 400);

    res.status(statusCode).json({
      success: false,
      error: {
        code: typed.code || (isNotFound ? 'NOT_FOUND' : isConflict ? 'CONFLICT' : 'BAD_REQUEST'),
        message: err.message,
        ...(typed.currentVersion !== undefined ? { currentVersion: typed.currentVersion } : {}),
        ...(typed.conflictingFields !== undefined ? { conflictingFields: typed.conflictingFields } : {}),
        ...(typed.latestEmployee !== undefined ? { latestEmployee: typed.latestEmployee } : {}),
        details:
          typed.currentVersion === undefined && typed.conflictingFields === undefined
            ? []
            : [
                {
                  ...(typed.currentVersion !== undefined ? { currentVersion: typed.currentVersion } : {}),
                  ...(typed.conflictingFields !== undefined ? { conflictingFields: typed.conflictingFields } : {}),
                },
              ],
      },
    });
    return;
  }

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected server error occurred',
      details: [],
    },
  });
};
