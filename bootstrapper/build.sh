#!/bin/bash
# Build and publish ElizaOS Bootstrapper image

set -e

VERSION="${1:-latest}"
REGISTRY="${2:-elizaos}"

echo "🏗️  Building ElizaOS Bootstrapper..."
echo "  Version: ${VERSION}"
echo "  Registry: ${REGISTRY}"
echo ""

# Build the image
docker build -t ${REGISTRY}/bootstrapper:${VERSION} .

# If version is not 'latest', also tag as latest
if [ "$VERSION" != "latest" ]; then
    docker tag ${REGISTRY}/bootstrapper:${VERSION} ${REGISTRY}/bootstrapper:latest
    echo "✅ Tagged as both ${VERSION} and latest"
fi

echo "✅ Build completed successfully!"
echo ""
echo "To publish to Docker Hub:"
echo "  docker push ${REGISTRY}/bootstrapper:${VERSION}"
echo "  docker push ${REGISTRY}/bootstrapper:latest"
echo ""
echo "To test locally:"
echo "  docker run -it --rm -e R2_ARTIFACT_URL=... -e R2_ACCESS_KEY_ID=... ${REGISTRY}/bootstrapper:${VERSION}"

