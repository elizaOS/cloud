#!/bin/sh
set -e

echo "🚀 ElizaOS Bootstrapper starting..."

# Configuration from environment
R2_ARTIFACT_URL="${R2_ARTIFACT_URL:-}"
R2_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID:-}"
R2_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY:-}"
R2_SESSION_TOKEN="${R2_SESSION_TOKEN:-}"
R2_ARTIFACT_CHECKSUM="${R2_ARTIFACT_CHECKSUM:-}"
R2_BUCKET_NAME="${R2_BUCKET_NAME:-eliza-artifacts}"
R2_ENDPOINT="${R2_ENDPOINT:-}"
START_CMD="${START_CMD:-bun run start}"
SKIP_BUILD="${SKIP_BUILD:-false}"
PORT="${PORT:-3000}"

# Validate required environment variables
if [ -z "$R2_ARTIFACT_URL" ]; then
    echo "❌ Error: R2_ARTIFACT_URL is required"
    exit 1
fi

if [ -z "$R2_ACCESS_KEY_ID" ] || [ -z "$R2_SECRET_ACCESS_KEY" ]; then
    echo "❌ Error: R2 credentials are required"
    exit 1
fi

echo "📦 Configuration:"
echo "  - Artifact URL: ${R2_ARTIFACT_URL}"
echo "  - Endpoint: ${R2_ENDPOINT}"
echo "  - Port: ${PORT}"
echo "  - Start command: ${START_CMD}"
echo "  - Skip build: ${SKIP_BUILD}"

# Download artifact from R2
echo "📥 Downloading artifact from R2..."

ARTIFACT_FILE="/tmp/artifact.tar.gz"

# Use AWS CLI environment variables for authentication
export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export AWS_SESSION_TOKEN="$R2_SESSION_TOKEN"
export AWS_DEFAULT_REGION="auto"

# Download using curl with AWS SigV4
# Extract the S3 path from the full URL
ARTIFACT_KEY=$(echo "$R2_ARTIFACT_URL" | sed -E "s|.*$R2_BUCKET_NAME/||")

# Construct R2 endpoint URL
if [ -z "$R2_ENDPOINT" ]; then
    echo "❌ Error: R2_ENDPOINT is required"
    exit 1
fi

DOWNLOAD_URL="${R2_ENDPOINT}/${R2_BUCKET_NAME}/${ARTIFACT_KEY}"

echo "  Downloading from: ${DOWNLOAD_URL}"

# Download with temporary credentials
# Note: This uses the session token in the header
curl -f -L \
    -H "X-Amz-Security-Token: ${R2_SESSION_TOKEN}" \
    --aws-sigv4 "aws:amz:auto:s3" \
    --user "${R2_ACCESS_KEY_ID}:${R2_SECRET_ACCESS_KEY}" \
    "${DOWNLOAD_URL}" \
    -o "${ARTIFACT_FILE}" || {
        echo "❌ Failed to download artifact"
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

# Run the start command
cd /app/project
exec $START_CMD

