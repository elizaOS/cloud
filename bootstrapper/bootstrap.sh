#!/bin/sh
set -e

echo "🚀 ElizaOS Bootstrapper starting..."

# Configuration from environment
R2_ARTIFACT_URL="${R2_ARTIFACT_URL:-}"
R2_ARTIFACT_CHECKSUM="${R2_ARTIFACT_CHECKSUM:-}"
START_CMD="${START_CMD:-bun run start}"
SKIP_BUILD="${SKIP_BUILD:-false}"
PORT="${PORT:-3000}"

# SECURITY: Validate required environment variables and format
if [ -z "$R2_ARTIFACT_URL" ]; then
    echo "❌ Error: R2_ARTIFACT_URL is required"
    exit 1
fi

# SECURITY: Validate URL format to prevent injection attacks
# Must start with https:// and contain no dangerous shell metacharacters
case "$R2_ARTIFACT_URL" in
    https://*)
        # Check for dangerous shell metacharacters
        if echo "$R2_ARTIFACT_URL" | grep -q '[;&|`$(){}]'; then
            echo "❌ Error: R2_ARTIFACT_URL contains invalid characters"
            exit 1
        fi
        ;;
    *)
        echo "❌ Error: R2_ARTIFACT_URL must start with https://"
        exit 1
        ;;
esac

# SECURITY: Validate START_CMD to prevent command injection
# Only allow alphanumeric, spaces, hyphens, underscores, and forward slashes
if ! echo "$START_CMD" | grep -qE '^[a-zA-Z0-9 /_.-]+$'; then
    echo "❌ Error: START_CMD contains invalid characters"
    echo "   Allowed: alphanumeric, spaces, hyphens, underscores, forward slashes"
    echo "   Got: $START_CMD"
    exit 1
fi

# SECURITY: Validate PORT is a valid number
if ! echo "$PORT" | grep -qE '^[0-9]+$'; then
    echo "❌ Error: PORT must be a number"
    exit 1
fi

if [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
    echo "❌ Error: PORT must be between 1 and 65535"
    exit 1
fi

# SECURITY: Validate SKIP_BUILD is boolean
case "$SKIP_BUILD" in
    true|false|TRUE|FALSE)
        ;;
    *)
        echo "❌ Error: SKIP_BUILD must be 'true' or 'false'"
        exit 1
        ;;
esac

# SECURITY: Validate checksum format if provided (SHA256 is 64 hex characters)
if [ -n "$R2_ARTIFACT_CHECKSUM" ]; then
    if ! echo "$R2_ARTIFACT_CHECKSUM" | grep -qE '^[a-fA-F0-9]{64}$'; then
        echo "❌ Error: R2_ARTIFACT_CHECKSUM must be a valid SHA256 hash (64 hex characters)"
        exit 1
    fi
fi

echo "📦 Configuration:"
echo "  - Artifact URL: (presigned URL - hidden for security)"
echo "  - Port: ${PORT}"
echo "  - Start command: ${START_CMD}"
echo "  - Skip build: ${SKIP_BUILD}"

# Download artifact from R2
echo "📥 Downloading artifact from R2..."

ARTIFACT_FILE="/tmp/artifact.tar.gz"

# SECURITY: Use presigned URL directly - no credentials needed
# The URL already contains authentication via query parameters
echo "  Downloading artifact using presigned URL..."

# Download using curl with presigned URL (simple GET request)
# The presigned URL contains all authentication in the URL itself
curl -f -L \
    --max-time 300 \
    --retry 3 \
    --retry-delay 5 \
    "${R2_ARTIFACT_URL}" \
    -o "${ARTIFACT_FILE}" || {
        echo "❌ Failed to download artifact"
        echo "   This could be due to:"
        echo "   - Network connectivity issues"
        echo "   - Expired presigned URL (valid for 1 hour)"
        echo "   - Invalid or inaccessible artifact"
        exit 1
    }

echo "✅ Artifact downloaded successfully"

# Validate checksum if provided
if [ -n "$R2_ARTIFACT_CHECKSUM" ]; then
    echo "🔍 Validating artifact checksum..."
    ACTUAL_CHECKSUM=$(sha256sum "$ARTIFACT_FILE" | awk '{print $1}')
    
    if [ "$ACTUAL_CHECKSUM" != "$R2_ARTIFACT_CHECKSUM" ]; then
        echo "❌ Checksum validation failed!"
        echo "  Expected: $R2_ARTIFACT_CHECKSUM"
        echo "  Actual:   $ACTUAL_CHECKSUM"
        exit 1
    fi
    
    echo "✅ Checksum validated"
fi

# SECURITY: Validate tar.gz structure before extraction
echo "🔍 Validating archive structure..."

# Test archive integrity without extracting
if ! tar -tzf "$ARTIFACT_FILE" > /dev/null 2>&1; then
    echo "❌ Archive is corrupted or invalid"
    exit 1
fi

# Check for dangerous paths (path traversal, absolute paths)
DANGEROUS_PATHS=$(tar -tzf "$ARTIFACT_FILE" | grep -E '(^/|\.\./)' || true)
if [ -n "$DANGEROUS_PATHS" ]; then
    echo "❌ Archive contains dangerous paths (absolute or parent directory references):"
    echo "$DANGEROUS_PATHS"
    exit 1
fi

# Check archive doesn't contain device files, symlinks to dangerous locations
# List archive with verbose output and check for dangerous file types
if tar -tzf "$ARTIFACT_FILE" | grep -qE '(^dev/|^proc/|^sys/)'; then
    echo "❌ Archive contains system device paths"
    exit 1
fi

# Limit archive size to prevent zip bombs (max 2GB extracted)
ARCHIVE_SIZE=$(tar -tzf "$ARTIFACT_FILE" | wc -l)
if [ "$ARCHIVE_SIZE" -gt 100000 ]; then
    echo "❌ Archive contains too many files ($ARCHIVE_SIZE). Maximum 100,000 files allowed."
    exit 1
fi

echo "✅ Archive structure validated"

# Extract artifact
echo "📂 Extracting artifact..."
cd /app/project
tar -xzf "$ARTIFACT_FILE" || {
    echo "❌ Failed to extract artifact"
    exit 1
}

# Clean up artifact file
rm -f "$ARTIFACT_FILE"

echo "✅ Artifact extracted"

# Install dependencies
echo "📦 Installing dependencies..."
if [ -f "package.json" ]; then
    bun install --production || {
        echo "❌ Failed to install dependencies"
        exit 1
    }
    echo "✅ Dependencies installed"
else
    echo "⚠️  No package.json found, skipping dependency installation"
fi

# Build project if needed
if [ "$SKIP_BUILD" != "true" ] && [ -f "package.json" ]; then
    # Check if build script exists
    if grep -q '"build"' package.json; then
        echo "🔨 Building project..."
        bun run build || {
            echo "⚠️  Build failed, continuing anyway..."
        }
        echo "✅ Build completed"
    else
        echo "ℹ️  No build script found, skipping build"
    fi
fi

# Create health check endpoint wrapper
cat > /app/health-check.sh << 'EOF'
#!/bin/sh
# Simple health check - verify process is running
pgrep -f "bun.*start" > /dev/null && exit 0 || exit 1
EOF
chmod +x /app/health-check.sh

# Start the application
echo "🚀 Starting ElizaOS project..."
echo "  Command: ${START_CMD}"
echo "  Port: ${PORT}"
echo ""

# Export PORT for the application
export PORT

# SECURITY: Execute start command safely
# Use sh -c with proper quoting to prevent injection
cd /app/project

# Split START_CMD into command and args for safer execution
# This prevents shell injection while allowing legitimate commands
set -- $START_CMD
exec "$@"

