# x402 Facilitator Service
# Verifies and settles x402 HTTP payments on behalf of agents
#
# Build context should be the workspace root so facilitator/ source is accessible.
# Example:
#   docker build -f eliza-cloud-v2/services/facilitator/Dockerfile -t x402-facilitator .

# ---- Builder stage ----
FROM oven/bun:1 AS builder
WORKDIR /app

# Copy facilitator source from the facilitator repo
COPY facilitator/ ./facilitator/

WORKDIR /app/facilitator
RUN bun install --frozen-lockfile
RUN bun run build

# ---- Production stage ----
FROM oven/bun:1-slim
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user for security
RUN addgroup --system --gid 1001 facilitator && \
    adduser --system --uid 1001 --ingroup facilitator facilitator

# Copy only the build artifacts and production dependencies
COPY --from=builder /app/facilitator/dist ./dist
COPY --from=builder /app/facilitator/node_modules ./node_modules
COPY --from=builder /app/facilitator/package.json ./

USER facilitator

EXPOSE 8090
ENV PORT=8090

# Health check: hit the /supported endpoint which returns network info
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD bun -e "fetch('http://localhost:8090/supported').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["bun", "run", "dist/index.js"]
