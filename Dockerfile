# ============================================================
# Stage 1: Builder
# ============================================================
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma/ ./prisma/

RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN npx prisma generate && npm run build

# ============================================================
# Stage 2: Production
# ============================================================
FROM node:20-alpine AS production

WORKDIR /app

# Install OpenSSL 3 required by Prisma engine on Alpine
RUN apk add --no-cache openssl

# Create unprivileged user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY package*.json ./
COPY prisma/ ./prisma/

# Install production dependencies only
RUN npm ci --omit=dev

# Copy the Prisma-generated client from the builder stage
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

# Copy compiled application
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist

# Create logs directory with correct ownership before dropping to non-root user
RUN mkdir -p logs && chown appuser:appgroup logs

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/v1/health || exit 1

CMD ["node", "dist/server.js"]
