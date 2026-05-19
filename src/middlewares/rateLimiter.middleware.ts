import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { getRedisClient } from '../config/redis';
import { env } from '../config/env';

function createRedisStore(prefix: string) {
  return new RedisStore({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sendCommand: (...args: string[]) => (getRedisClient() as any).call(...args),
    prefix,
  });
}

/**
 * Global rate limiter — applied to all routes.
 * Skips the /health endpoint to prevent false positives in load balancer checks.
 *
 * OWASP A04: Insecure Design & DoS mitigation.
 */
export const globalRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('rl:global:'),
  skip: (req) => req.path === '/api/v1/health',
  message: {
    success: false,
    message: 'Too many requests, please try again later.',
  },
});

/**
 * Strict auth rate limiter — applied only to authentication endpoints.
 * Limits brute-force and credential stuffing attacks.
 *
 * OWASP A07: Identification and Authentication Failures mitigation.
 */
export const authRateLimiter = rateLimit({
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('rl:auth:'),
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later.',
  },
});
