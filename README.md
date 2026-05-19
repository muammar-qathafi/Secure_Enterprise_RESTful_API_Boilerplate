# Secure Enterprise RESTful API Boilerplate

> A production-ready, highly secure, and modular backend boilerplate built with **Node.js**, **TypeScript**, **Express**, **Prisma ORM**, and **PostgreSQL**. Engineered with strict adherence to **ACID compliance** and full **OWASP Top 10** mitigation. Containerized with **Docker** for seamless deployment.

[![CI/CD Pipeline](https://github.com/your-username/secure-enterprise-api/actions/workflows/ci.yml/badge.svg)](https://github.com/your-username/secure-enterprise-api/actions)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20_LTS-green)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Security Architecture (OWASP)](#security-architecture-owasp)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Local Development](#local-development)
  - [Docker Deployment](#docker-deployment)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Database Design](#database-design)
- [Testing](#testing)
- [Contributing](#contributing)

---

## Features

| Feature | Description |
|---|---|
| **JWT Authentication** | Access + refresh token pair with rotation and revocation |
| **Token Blacklisting** | Revoked access tokens stored in Redis for instant logout |
| **Role-Based Access Control** | `USER`, `MODERATOR`, `ADMIN` roles enforced via middleware |
| **ACID Transactions** | All multi-step DB operations wrapped in `prisma.$transaction()` |
| **Request Validation** | Schema-first validation using Zod (body, params, query) |
| **Rate Limiting** | Redis-backed rate limiting — global and strict auth-specific |
| **Audit Logging** | Immutable audit trail persisted in PostgreSQL |
| **Structured Logging** | JSON-structured logs via Winston with per-request correlation IDs |
| **OpenAPI Docs** | Interactive Swagger UI at `/api-docs` |
| **Docker Ready** | Multi-stage Dockerfile + Docker Compose for full local stack |
| **CI/CD Pipeline** | GitHub Actions: lint → test → Docker build |
| **Optimized Indexing** | Strategic DB indexes on frequently queried columns |

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js 20 LTS |
| **Language** | TypeScript 5 (strict mode) |
| **Framework** | Express 4 |
| **ORM** | Prisma 5 |
| **Database** | PostgreSQL 15 (ACID-compliant) |
| **Cache / Session** | Redis 7 (token blacklist + rate limiting) |
| **Validation** | Zod |
| **Auth** | JSON Web Tokens (`jsonwebtoken`) |
| **Hashing** | bcryptjs (configurable rounds) |
| **Security Headers** | Helmet |
| **Rate Limiting** | express-rate-limit + rate-limit-redis |
| **API Docs** | Swagger UI (swagger-jsdoc) |
| **Logging** | Winston |
| **Testing** | Jest + Supertest |
| **Containerization** | Docker + Docker Compose |

---

## Security Architecture (OWASP)

This boilerplate directly addresses all **OWASP Top 10 (2021)** risks:

| OWASP Risk | Mitigation Implemented |
|---|---|
| **A01 — Broken Access Control** | RBAC middleware (`authorize()`), per-route role enforcement |
| **A02 — Cryptographic Failures** | bcrypt password hashing, JWT secrets validated ≥ 32 chars, HTTPS headers (HSTS) |
| **A03 — Injection** | Prisma parameterized queries (ORM), Zod schema validation, HPP middleware |
| **A04 — Insecure Design** | Clean module architecture, principle of least privilege, short-lived JWTs |
| **A05 — Security Misconfiguration** | Helmet security headers, Zod env validation at startup, non-root Docker user |
| **A06 — Vulnerable Components** | `npm audit` in CI, locked dependencies |
| **A07 — Auth & Session Failures** | Token rotation, Redis blacklist, same-error for invalid credentials (anti-enumeration) |
| **A08 — Data Integrity Failures** | ACID transactions for all state-changing operations |
| **A09 — Logging & Monitoring Failures** | Request correlation IDs, structured Winston logging, audit log table |
| **A10 — Server-Side Request Forgery** | No outbound HTTP; CORS strict origin allowlist |

---

## Project Structure

```
├── .github/workflows/        # GitHub Actions CI/CD
├── prisma/
│   └── schema.prisma         # Database schema (User, RefreshToken, AuditLog)
├── src/
│   ├── app.ts                # Express app — middleware stack & Swagger
│   ├── server.ts             # Entry point — graceful startup & shutdown
│   ├── config/
│   │   ├── env.ts            # Zod environment variable validation
│   │   ├── database.ts       # Prisma client singleton
│   │   └── redis.ts          # ioredis client
│   ├── middlewares/
│   │   ├── auth.middleware.ts          # JWT verification + blacklist check
│   │   ├── rbac.middleware.ts          # Role-based authorization factory
│   │   ├── validate.middleware.ts      # Zod request validation factory
│   │   ├── rateLimiter.middleware.ts   # Global + auth rate limiters
│   │   ├── errorHandler.middleware.ts  # Centralized error handler
│   │   └── requestLogger.middleware.ts # Request logging with correlation ID
│   ├── modules/
│   │   ├── auth/             # Registration, login, logout, token refresh
│   │   └── users/            # User CRUD, RBAC-gated, audit logs
│   ├── routes/v1/            # API v1 router + health check
│   ├── types/                # Express augmentation & shared types
│   └── utils/
│       ├── AppError.ts       # Typed operational error hierarchy
│       ├── jwt.util.ts       # Token sign/verify helpers
│       ├── password.util.ts  # bcrypt hash/compare
│       ├── logger.util.ts    # Winston logger
│       └── apiResponse.util.ts  # Standardized response helpers
├── tests/
│   ├── setup.ts              # DB cleanup between tests
│   ├── auth/auth.test.ts     # Auth endpoint integration tests
│   └── users/user.test.ts    # User endpoint integration tests
├── Dockerfile                # Multi-stage production build
└── docker-compose.yml        # App + PostgreSQL + Redis
```

---

## Getting Started

### Prerequisites

- Node.js ≥ 20
- Docker & Docker Compose
- (Optional) PostgreSQL 15 and Redis 7 installed locally

### Local Development

```bash
# 1. Clone the repository
git clone https://github.com/your-username/secure-enterprise-api.git
cd secure-enterprise-api

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env and set strong JWT secrets (see Environment Variables section)

# 4. Start PostgreSQL and Redis with Docker
docker compose up db redis -d

# 5. Run database migrations
npm run prisma:migrate:dev

# 6. Generate Prisma Client
npm run prisma:generate

# 7. Start the development server (hot reload)
npm run dev
```

The API will be available at `http://localhost:3000`.
Swagger UI: `http://localhost:3000/api-docs`

### Docker Deployment

```bash
# Copy and configure environment
cp .env.example .env

# Build and start all services (app + db + redis)
docker compose up --build -d

# Run migrations inside the container
docker compose exec app npx prisma migrate deploy
```

---

## Environment Variables

All variables are validated at startup via Zod. The application will **refuse to start** if any required variable is missing or invalid.

| Variable | Required | Description |
|---|---|---|
| `NODE_ENV` | No | `development` \| `production` \| `test` |
| `PORT` | No | HTTP port (default: `3000`) |
| `DATABASE_URL` | **Yes** | PostgreSQL connection string |
| `REDIS_URL` | **Yes** | Redis connection string |
| `JWT_ACCESS_SECRET` | **Yes** | ≥ 32-char secret for access tokens |
| `JWT_REFRESH_SECRET` | **Yes** | ≥ 32-char secret for refresh tokens |
| `JWT_ACCESS_EXPIRES_IN` | No | Access token TTL (default: `15m`) |
| `JWT_REFRESH_EXPIRES_IN` | No | Refresh token TTL (default: `7d`) |
| `BCRYPT_ROUNDS` | No | bcrypt cost factor — 10–15 (default: `12`) |
| `RATE_LIMIT_MAX_REQUESTS` | No | Global rate limit per window (default: `100`) |
| `AUTH_RATE_LIMIT_MAX_REQUESTS` | No | Auth rate limit per window (default: `5`) |
| `CORS_ORIGIN` | No | Comma-separated allowed origins |

> **Generate a secure secret:**
> ```bash
> node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
> ```

---

## API Reference

Full interactive documentation is available at **`/api-docs`** when the server is running.

### Authentication

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/auth/register` | — | Register a new account |
| `POST` | `/api/v1/auth/login` | — | Login, receive access + refresh tokens |
| `POST` | `/api/v1/auth/refresh` | — | Rotate tokens using a refresh token |
| `POST` | `/api/v1/auth/logout` | Bearer | Revoke session |
| `GET` | `/api/v1/auth/me` | Bearer | Get current user |
| `PATCH` | `/api/v1/auth/change-password` | Bearer | Change password |

### Users (Admin only except GET /:id)

| Method | Endpoint | Role | Description |
|---|---|---|---|
| `GET` | `/api/v1/users` | ADMIN | Paginated user list with filters |
| `GET` | `/api/v1/users/:id` | Any | Get user by ID |
| `PATCH` | `/api/v1/users/:id` | ADMIN | Update role / status / username |
| `DELETE` | `/api/v1/users/:id` | ADMIN | Hard-delete user |
| `GET` | `/api/v1/users/audit-logs` | ADMIN | System audit log |

### Example — Register

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","username":"alice","password":"Str0ng!Pass"}'
```

**Response `201`**
```json
{
  "success": true,
  "message": "Account created successfully",
  "data": {
    "user": { "id": "...", "email": "alice@example.com", "username": "alice", "role": "USER" },
    "tokens": {
      "accessToken": "eyJhb...",
      "refreshToken": "eyJhb...",
      "expiresIn": 900
    }
  }
}
```

---

## Database Design

```
users
  id (PK, UUID)
  email          UNIQUE, INDEXED
  username       UNIQUE
  password_hash
  role           ENUM(USER, MODERATOR, ADMIN)
  is_active
  created_at / updated_at

refresh_tokens
  id (PK, UUID)
  token          UNIQUE, INDEXED
  user_id        FK → users (CASCADE DELETE)
  expires_at     INDEXED
  is_revoked
  ip_address / user_agent

audit_logs
  id (PK, UUID)
  user_id        FK → users (SET NULL on delete)
  action / resource / status_code
  ip_address / user_agent / metadata
  created_at     INDEXED
```

All multi-step writes use `prisma.$transaction()` to guarantee **atomicity**, **consistency**, and **isolation** (ACID).

---

## Testing

```bash
# Run all integration tests
npm test

# Watch mode
npm run test:watch

# With coverage report
npm run test:coverage
```

Tests require a running PostgreSQL and Redis instance. Use `.env.test` for test-specific configuration. The CI pipeline spins these up automatically as GitHub Actions service containers.

**Test coverage:**

- `POST /auth/register` — success, duplicate email/username, weak password, missing fields
- `POST /auth/login` — success, wrong password, non-existent user (anti-enumeration check)
- `POST /auth/refresh` — token rotation, invalid token rejection
- `GET /auth/me` — authenticated vs unauthenticated
- `POST /auth/logout` — token revocation verified in DB
- `GET /users` — pagination, search, RBAC enforcement
- `GET /users/:id` — success, 404, invalid UUID
- `PATCH /users/:id` — admin update, non-admin rejection
- `DELETE /users/:id` — hard delete confirmed in DB

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m 'feat: add my feature'`
4. Push and open a Pull Request

Please run `npm run lint` and `npm test` before submitting.

---

## License

[MIT](LICENSE)
