import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import hpp from 'hpp';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';

import { env } from './config/env';
import { globalRateLimiter } from './middlewares/rateLimiter.middleware';
import { requestLogger } from './middlewares/requestLogger.middleware';
import { errorHandler } from './middlewares/errorHandler.middleware';
import v1Router from './routes/v1';

const app = express();

// ─────────────────────────────────────────────────────────────────────────────
// Security Headers (OWASP A05: Security Misconfiguration)
// ─────────────────────────────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        scriptSrc: ["'self'"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    noSniff: true,
    frameguard: { action: 'deny' },
    xssFilter: true,
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// CORS
// ─────────────────────────────────────────────────────────────────────────────
const allowedOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400,
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// Body Parsing & Misc Protections
// ─────────────────────────────────────────────────────────────────────────────
// Limit body size to prevent large-payload DoS attacks
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// HTTP Parameter Pollution protection (OWASP A03)
app.use(hpp());

// Trust first proxy hop for correct req.ip behind a reverse proxy
app.set('trust proxy', 1);

// ─────────────────────────────────────────────────────────────────────────────
// Request Logging & Rate Limiting
// ─────────────────────────────────────────────────────────────────────────────
app.use(requestLogger);
app.use(globalRateLimiter);

// ─────────────────────────────────────────────────────────────────────────────
// OpenAPI / Swagger Documentation
// ─────────────────────────────────────────────────────────────────────────────
// In production the source .ts files don't exist – scan compiled .js instead.
const isProduction = env.NODE_ENV === 'production';
const apiGlobs = isProduction
  ? ['./dist/modules/**/*.routes.js', './dist/routes/**/*.js']
  : ['./src/modules/**/*.routes.ts', './src/routes/**/*.ts'];

const swaggerOptions: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Secure Enterprise RESTful API',
      version: '1.0.0',
      description:
        'A highly secure, modular, and scalable backend boilerplate with strict ACID compliance ' +
        'and OWASP Top 10 mitigation. Features JWT authentication with token rotation, ' +
        'role-based access control, structured request validation, and optimized database indexing.',
      contact: { name: 'API Support', email: 'support@example.com' },
      license: { name: 'MIT' },
    },
    servers: [
      {
        url: '/api/v1',
        description: `${env.NODE_ENV} server`,
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Provide your JWT access token in the format: `Bearer <token>`',
        },
      },
      schemas: {
        // ── Shared primitive schemas ──────────────────────────────────────────
        UserRole: {
          type: 'string',
          enum: ['USER', 'MODERATOR', 'ADMIN'],
          example: 'USER',
        },
        // ── Domain objects ────────────────────────────────────────────────────
        UserObject: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', example: 'a3bb189e-8bf9-3888-9912-ace4e6543002' },
            email: { type: 'string', format: 'email', example: 'john.doe@example.com' },
            username: { type: 'string', example: 'johndoe' },
            role: { $ref: '#/components/schemas/UserRole' },
            isActive: { type: 'boolean', example: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        AuthTokens: {
          type: 'object',
          properties: {
            accessToken: { type: 'string', description: 'JWT access token (15 min TTL)' },
            refreshToken: { type: 'string', description: 'Opaque refresh token (7 day TTL)' },
            expiresIn: {
              type: 'integer',
              example: 900,
              description: 'Access token TTL in seconds',
            },
          },
        },
        AuditLogObject: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            userId: { type: 'string', format: 'uuid', nullable: true },
            action: { type: 'string', example: 'LOGIN' },
            resource: { type: 'string', example: 'auth' },
            ipAddress: { type: 'string', example: '192.168.1.1' },
            userAgent: { type: 'string' },
            metadata: { type: 'object', additionalProperties: true },
            statusCode: { type: 'integer', example: 200 },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        PaginationMeta: {
          type: 'object',
          properties: {
            total: { type: 'integer', example: 42 },
            page: { type: 'integer', example: 1 },
            limit: { type: 'integer', example: 10 },
            totalPages: { type: 'integer', example: 5 },
            hasNext: { type: 'boolean', example: true },
            hasPrev: { type: 'boolean', example: false },
          },
        },
        // ── Response envelopes ────────────────────────────────────────────────
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Validation failed' },
            code: { type: 'string', example: 'VALIDATION_ERROR' },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
        RegisterResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Registration successful' },
            data: {
              type: 'object',
              properties: {
                user: { $ref: '#/components/schemas/UserObject' },
                tokens: { $ref: '#/components/schemas/AuthTokens' },
              },
            },
          },
        },
        LoginResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Login successful' },
            data: {
              type: 'object',
              properties: {
                user: { $ref: '#/components/schemas/UserObject' },
                tokens: { $ref: '#/components/schemas/AuthTokens' },
              },
            },
          },
        },
        RefreshTokenResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Tokens refreshed successfully' },
            data: { $ref: '#/components/schemas/AuthTokens' },
          },
        },
        MeResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'User retrieved successfully' },
            data: { $ref: '#/components/schemas/UserObject' },
          },
        },
        PaginatedUsersResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Users retrieved successfully' },
            data: {
              type: 'object',
              properties: {
                users: { type: 'array', items: { $ref: '#/components/schemas/UserObject' } },
                meta: { $ref: '#/components/schemas/PaginationMeta' },
              },
            },
          },
        },
        AuditLogsResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Audit logs retrieved successfully' },
            data: {
              type: 'object',
              properties: {
                logs: { type: 'array', items: { $ref: '#/components/schemas/AuditLogObject' } },
                meta: { $ref: '#/components/schemas/PaginationMeta' },
              },
            },
          },
        },
        UserResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'User retrieved successfully' },
            data: { $ref: '#/components/schemas/UserObject' },
          },
        },
      },
    },
    tags: [
      { name: 'Health', description: 'Service liveness and readiness probes' },
      { name: 'Authentication', description: 'Register, login, token rotation, logout' },
      { name: 'Users', description: 'User CRUD and audit log access (Admin only)' },
    ],
  },
  apis: apiGlobs,
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { explorer: true }));
app.get('/api-docs.json', (_req, res) => res.json(swaggerSpec));

// ─────────────────────────────────────────────────────────────────────────────
// API Routes
// ─────────────────────────────────────────────────────────────────────────────
app.use('/api/v1', v1Router);

// ─────────────────────────────────────────────────────────────────────────────
// 404 Catch-All
// ─────────────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found', code: 'NOT_FOUND' });
});

// ─────────────────────────────────────────────────────────────────────────────
// Global Error Handler (must be registered last)
// ─────────────────────────────────────────────────────────────────────────────
app.use(errorHandler);

export default app;
