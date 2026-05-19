import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt.util';
import { getRedisClient } from '../config/redis';
import { UnauthorizedError } from '../utils/AppError';
import { Role } from '@prisma/client';

/**
 * JWT Authentication Middleware
 * Validates the Bearer token and checks the token blacklist in Redis.
 * Attaches the decoded user payload to req.user.
 *
 * OWASP A07: Identification and Authentication Failures mitigation.
 */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or malformed Authorization header');
    }

    const token = authHeader.slice(7);
    const payload = verifyAccessToken(token);

    if (payload.type !== 'access') {
      throw new UnauthorizedError('Invalid token type');
    }

    // Check token blacklist in Redis (handles logout/revocation)
    if (payload.jti) {
      const redis = getRedisClient();
      const isBlacklisted = await redis.get(`blacklist:${payload.jti}`);
      if (isBlacklisted) {
        throw new UnauthorizedError('Token has been revoked');
      }
    }

    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role as Role,
      jti: payload.jti,
    };

    next();
  } catch (error) {
    next(error);
  }
}
