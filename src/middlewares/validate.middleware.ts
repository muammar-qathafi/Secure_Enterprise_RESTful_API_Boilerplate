import { Request, Response, NextFunction } from 'express';
import { ZodTypeAny, ZodError } from 'zod';

interface ValidationTargets {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
}

/**
 * Zod-based Request Validation Middleware Factory.
 * Validates and sanitizes req.body, req.params, and req.query using Zod schemas.
 * Replaces the raw values with the parsed/transformed output, ensuring type safety
 * throughout the request lifecycle.
 *
 * OWASP A03: Injection mitigation via strict input validation.
 *
 * @example
 * router.post('/register', validate({ body: registerSchema }), handler);
 */
export function validate(targets: ValidationTargets) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (targets.body) {
        req.body = await targets.body.parseAsync(req.body);
      }
      if (targets.params) {
        req.params = await targets.params.parseAsync(req.params);
      }
      if (targets.query) {
        req.query = await targets.query.parseAsync(req.query);
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors: Record<string, string[]> = {};
        error.errors.forEach((err) => {
          const field = err.path.join('.') || 'root';
          if (!errors[field]) {
            errors[field] = [];
          }
          errors[field].push(err.message);
        });
        res.status(422).json({
          success: false,
          message: 'Validation failed',
          errors,
        });
      } else {
        next(error);
      }
    }
  };
}
