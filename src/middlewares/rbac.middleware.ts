import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { ForbiddenError, UnauthorizedError } from '../utils/AppError';

/**
 * Role-Based Access Control (RBAC) Middleware factory.
 * Accepts one or more allowed roles and returns a middleware that
 * enforces authorization based on the authenticated user's role.
 *
 * OWASP A01: Broken Access Control mitigation.
 *
 * @example
 * router.get('/admin-only', authenticate, authorize(Role.ADMIN), handler);
 * router.get('/mod-or-admin', authenticate, authorize(Role.MODERATOR, Role.ADMIN), handler);
 */
export function authorize(...allowedRoles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      next(new ForbiddenError('You do not have permission to perform this action'));
      return;
    }

    next();
  };
}
