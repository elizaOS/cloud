# ElizaOS Bootstrapper Container Image
# This image downloads artifacts from R2, extracts them, and runs ElizaOS projects
# Used for efficient, versioned deployments to Cloudflare Workers

FROM oven/bun:1.2-alpine AS base

# Install required tools
RUN apk add --no-cache \
    curl \
    wget \
    tar \
    gzip \
    ca-certificates

WORKDIR /app

# Create directories
RUN mkdir -p /app/project /app/logs

# Copy bootstrapper script
COPY bootstrap.sh /app/bootstrap.sh
RUN chmod +x /app/bootstrap.sh

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose port (configurable at runtime)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/health || exit 1

# Run bootstrapper
CMD ["/app/bootstrap.sh"]

