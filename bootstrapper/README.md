# ElizaOS Bootstrapper

A lightweight Docker container that downloads and runs ElizaOS project artifacts from Cloudflare R2 storage.

## Purpose

The bootstrapper enables efficient, versioned deployments by:

1. Downloading pre-built project artifacts from R2
2. Validating integrity via checksum
3. Installing dependencies
4. Running the project with configurable commands

This separates the build phase from runtime, allowing for:

- Faster deployments (small bootstrapper image)
- Version control of artifacts
- Easy rollbacks
- Reduced attack surface

## How It Works

```
Container Start
    ↓
Download artifact from R2 (using temp credentials)
    ↓
Validate checksum
    ↓
Extract tar.gz
    ↓
Install dependencies (bun install)
    ↓
Optionally build project
    ↓
Run start command (configurable)
```

## Environment Variables

### Required

- `R2_ARTIFACT_URL` - Full URL to the artifact in R2
- `R2_ACCESS_KEY_ID` - Temporary R2 access key
- `R2_SECRET_ACCESS_KEY` - Temporary R2 secret key
- `R2_SESSION_TOKEN` - Temporary session token
- `R2_ENDPOINT` - R2 endpoint URL
- `R2_BUCKET_NAME` - R2 bucket name (default: eliza-artifacts)

### Optional

- `R2_ARTIFACT_CHECKSUM` - SHA256 checksum for validation
- `START_CMD` - Command to run the project (default: "bun run start")
- `SKIP_BUILD` - Skip build step (default: false)
- `PORT` - Port for the application (default: 3000)

### Application-Specific

Any environment variables needed by your ElizaOS project can be passed through and will be available to the application.

## Building the Image

```bash
cd bootstrapper
docker build -t elizaos/bootstrapper:latest .
docker tag elizaos/bootstrapper:latest elizaos/bootstrapper:v1.0.0
```

## Publishing to Registry

```bash
# Docker Hub
docker push elizaos/bootstrapper:latest
docker push elizaos/bootstrapper:v1.0.0

# Or to GitHub Container Registry
docker tag elizaos/bootstrapper:latest ghcr.io/elizaos/bootstrapper:latest
docker push ghcr.io/elizaos/bootstrapper:latest
```

## Testing Locally

```bash
# Build the image
docker build -t elizaos/bootstrapper:test .

# Run with environment variables
docker run -it --rm \
  -e R2_ARTIFACT_URL="https://your-r2-endpoint/bucket/path/artifact.tar.gz" \
  -e R2_ACCESS_KEY_ID="your-access-key" \
  -e R2_SECRET_ACCESS_KEY="your-secret-key" \
  -e R2_SESSION_TOKEN="your-session-token" \
  -e R2_ENDPOINT="https://your-account.r2.cloudflarestorage.com" \
  -e R2_BUCKET_NAME="eliza-artifacts" \
  -e START_CMD="bun run start" \
  -p 3000:3000 \
  elizaos/bootstrapper:test
```

## Security Considerations

1. **Temporary Credentials**: R2 credentials are scoped and time-limited (typically 1-6 hours)
2. **Read-Only Access**: Download credentials have read-only permissions
3. **Checksum Validation**: Artifacts are validated before extraction
4. **Minimal Base Image**: Uses Alpine Linux for small attack surface
5. **No Persistent Secrets**: Credentials are ephemeral and not stored

## Troubleshooting

### Artifact Download Fails

- Check R2 credentials are valid and not expired
- Verify R2_ENDPOINT is correct
- Ensure artifact path exists in R2
- Check network connectivity

### Checksum Validation Fails

- Artifact may be corrupted during upload
- Checksum mismatch indicates tampering
- Re-upload the artifact

### Dependencies Installation Fails

- Check package.json is valid
- Verify all dependencies are available
- Check network connectivity to npm registry

### Application Fails to Start

- Check START_CMD is correct
- Verify PORT is available
- Check application logs
- Ensure all required environment variables are set

## Integration with ElizaOS CLI

The bootstrapper is automatically used when deploying via `elizaos deploy`:

```bash
elizaos deploy --name my-agent --port 3000
```

The CLI will:

1. Create an artifact of your project
2. Upload to R2 via the Cloud API
3. Deploy this bootstrapper image with artifact URL
4. Bootstrapper downloads and runs your project

## Version History

- **v1.0.0** - Initial release
  - Basic artifact download and extraction
  - Checksum validation
  - Dependency installation
  - Configurable start command
