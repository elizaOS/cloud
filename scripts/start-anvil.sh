#!/bin/bash
# Start Anvil local blockchain for x402 and ERC-8004 testing
#
# Usage:
#   ./scripts/start-anvil.sh           # Start Anvil only
#   ./scripts/start-anvil.sh --deploy  # Start + deploy contracts
#
# Default accounts (Anvil):
#   Account #0: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
#   Private Key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
#
# For ERC-8004 development, we recommend using Base Sepolia instead of local Anvil:
#   1. The official agent0 contracts are deployed on Base Sepolia
#   2. Subgraph indexing is available for agent discovery
#   3. Free testnet ETH available from faucets
#
# See: bun run scripts/register-eliza-cloud.ts --network base-sepolia

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}🔨 Eliza Cloud Local Development${NC}"
echo "================================="

# Check if anvil is installed
if ! command -v anvil &> /dev/null; then
    echo -e "${RED}❌ Anvil not found. Install Foundry:${NC}"
    echo "   curl -L https://foundry.paradigm.xyz | bash"
    echo "   foundryup"
    exit 1
fi

# Default configuration
PORT=${ANVIL_PORT:-8545}
CHAIN_ID=${ANVIL_CHAIN_ID:-31337}
BLOCK_TIME=${ANVIL_BLOCK_TIME:-1}
DEPLOY=${1:-""}

echo -e "\n${BLUE}📋 Configuration:${NC}"
echo "   Port: $PORT"
echo "   Chain ID: $CHAIN_ID"
echo "   Block Time: ${BLOCK_TIME}s"

# Check if Anvil is already running
if lsof -i :$PORT > /dev/null 2>&1; then
    echo -e "\n${YELLOW}⚠️  Port $PORT is already in use${NC}"
    echo "   Anvil may already be running."
    echo "   Use 'pkill anvil' to stop it first."
    exit 1
fi

# ERC-8004 information
echo -e "\n${BLUE}📖 ERC-8004 Development Guide:${NC}"
echo ""
echo "   For ERC-8004 agent registration, we recommend Base Sepolia:"
echo ""
echo "   1. Get test ETH:"
echo "      https://www.coinbase.com/faucets/base-ethereum-goerli-faucet"
echo ""
echo "   2. Set environment variables in .env.local:"
echo "      AGENT0_PRIVATE_KEY=0x...  # Your wallet private key"
echo "      PINATA_JWT=...            # Optional: for IPFS storage"
echo ""
echo "   3. Register Eliza Cloud as an agent:"
echo "      bun run scripts/register-eliza-cloud.ts --network base-sepolia"
echo ""
echo "   4. Verify your agent:"
echo "      https://sepolia.basescan.org/address/0x8004AA63c570c570eBF15376c0dB199918BFe9Fb"
echo ""

# x402 information
echo -e "${BLUE}💰 x402 Payment Setup:${NC}"
echo ""
echo "   1. Set your recipient wallet in .env.local:"
echo "      X402_RECIPIENT_ADDRESS=0x..."
echo "      ENABLE_X402_PAYMENTS=true"
echo ""
echo "   2. Get test USDC from Circle faucet:"
echo "      https://faucet.circle.com/ (select Base Sepolia)"
echo ""
echo "   3. Run x402 dev mode:"
echo "      bun run dev:x402"
echo ""

# Start Anvil
echo -e "${YELLOW}🚀 Starting Anvil...${NC}\n"

# Set environment for local development
export USE_ANVIL=true
export ERC8004_NETWORK=anvil
export X402_NETWORK=base-sepolia  # x402 still uses Base Sepolia (has real USDC)

echo "Environment:"
echo "   USE_ANVIL=true"
echo "   ERC8004_NETWORK=anvil"
echo "   X402_NETWORK=base-sepolia"
echo ""

anvil \
    --port $PORT \
    --chain-id $CHAIN_ID \
    --block-time $BLOCK_TIME \
    --accounts 10 \
    --balance 10000 \
    --gas-limit 30000000 \
    --host 0.0.0.0

# Note: Anvil will keep running. Press Ctrl+C to stop.
