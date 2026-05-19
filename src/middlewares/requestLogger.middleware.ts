import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.util';

/**
 * HTTP Request Logger Middleware.
 * Assigns a unique requestId to each request for distributed tracing,
 * and logs structured request/response metadata on completion.
 *
 * OWASP A09: Security Logging and Monitoring Failures mitigation.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  req.requestId = uuidv4();
  res.setHeader('X-Request-ID', req.requestId);

  const startTime = process.hrtime.bigint();

  res.on('finish', () => {
    const durationNs = process.hrtime.bigint() - startTime;
    const durationMs = Number(durationNs) / 1_000_000;

    const logData = {
      requestId: req.requestId,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      durationMs: durationMs.toFixed(2),
      ip: req.ip,
      userAgent: req.get('user-agent'),
      userId: req.user?.id,
    };

    if (res.statusCode >= 500) {
      logger.error(logData);
    } else if (res.statusCode >= 400) {
      logger.warn(logData);
    } else {
      logger.http(logData);
    }
  });

  next();
}
