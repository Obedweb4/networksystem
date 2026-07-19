# Multi-stage build for optimized production image
FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy monorepo root files
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./

# Copy all workspace packages
COPY lib ./lib
COPY artifacts ./artifacts

# Install dependencies
RUN pnpm install --frozen-lockfile

# Run typecheck and build
RUN pnpm run typecheck
RUN pnpm run build

# Production stage
FROM node:22-alpine

WORKDIR /app

# Install pnpm in production image
RUN npm install -g pnpm

# Copy built artifacts from builder
COPY --from=builder /app/artifacts/api-server/dist ./api-server/dist
COPY --from=builder /app/artifacts/api-server/package.json ./api-server/
COPY --from=builder /app/artifacts/api-server/node_modules ./api-server/node_modules
COPY --from=builder /app/lib/db/dist ./lib/db/dist
COPY --from=builder /app/lib/db/package.json ./lib/db/
COPY --from=builder /app/lib/api-zod/dist ./lib/api-zod/dist
COPY --from=builder /app/lib/api-zod/package.json ./lib/api-zod/
COPY --from=builder /app/lib/mikrotik/dist ./lib/mikrotik/dist
COPY --from=builder /app/lib/mikrotik/package.json ./lib/mikrotik/

# Set working directory to API server
WORKDIR /app/api-server

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start the application
CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
