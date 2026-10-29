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
    const isNotFound = err.message.toLowerCase().includes('not found');
    const isConflict = err.message.toLowerCase().includes('already exists');
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
