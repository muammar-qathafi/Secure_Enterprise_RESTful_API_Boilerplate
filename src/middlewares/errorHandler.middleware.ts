import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger.util';
import { env } from '../config/env';

/**
 * Centralized error handling middleware.
 * Classifies errors into operational (expected) and programmer (unexpected) errors.
 * In production, programmer errors return a generic message to avoid leaking internals.
 *
 * OWASP A09: Security Logging and Monitoring Failures mitigation.
 */
export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  logger.error({
    message: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    requestId: req.requestId,
    userId: req.user?.id,
  });

  // Known operational errors — return their specific message and status
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
      ...(error.code && { code: error.code }),
    });
    return;
  }

  // Prisma unique constraint violation
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    res.status(409).json({
      success: false,
      message: 'A record with this value already exists.',
      code: 'CONFLICT',
    });
    return;
  }

  // Prisma record not found
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2025'
  ) {
    res.status(404).json({
      success: false,
      message: 'Record not found.',
      code: 'NOT_FOUND',
    });
    return;
  }

  // Unhandled / programmer errors
  res.status(500).json({
    success: false,
    message:
      env.NODE_ENV === 'production'
        ? 'An unexpected error occurred. Please try again later.'
        : error.message,
    ...(env.NODE_ENV !== 'production' && { stack: error.stack }),
  });
}
