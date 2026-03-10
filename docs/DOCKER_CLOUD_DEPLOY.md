# Docker Provider — Cloud Deployment Guide

This document covers deploying eliza-cloud-v2 as the single dashboard/control plane with Docker-provider infrastructure management from Vercel or other serverless environments.

## Architecture

```
┌──────────────────────────┐      SSH / Headscale VPN
│  Vercel (Serverless)     │ ◄──────────────────────────►  Hetzner VPS Nodes
│  eliza-cloud-v2 Next.js  │                                (Docker containers)
│  - Admin dashboard       │
│  - Docker SSH client     │
│  - Headscale integration │
└──────────────────────────┘
```

The dashboard connects to Docker nodes via SSH for:
- Container lifecycle management (create, start, stop, logs)
- Health checks and ghost container auditing
- Log streaming

## SSH Key Configuration

### Option 1: Environment Variable (Recommended for Vercel/Serverless)

Set `MILADY_SSH_KEY` to a base64-encoded SSH private key. This avoids any filesystem dependency.

```bash
# Generate base64-encoded key from your existing SSH key:
base64 -w0 < ~/.ssh/id_ed25519

# Set in Vercel:
vercel env add MILADY_SSH_KEY production
# Paste the base64 output
```

In Vercel dashboard: **Settings → Environment Variables → Add `MILADY_SSH_KEY`**

> **Security note:** Use Vercel's encrypted environment variables. The key is decoded in-memory at runtime and never written to disk.

### Option 2: Filesystem Path (Traditional Servers)

Set `MILADY_SSH_KEY_PATH` to point at the PEM file on disk:

```bash
export MILADY_SSH_KEY_PATH=/etc/ssh/docker-deploy.key
```

Defaults to `~/.ssh/id_ed25519` if neither variable is set.

### Precedence

1. `MILADY_SSH_KEY` (base64 env var) — checked first
2. `MILADY_SSH_KEY_PATH` (filesystem path) — fallback
3. `~/.ssh/id_ed25519` — default if nothing is set

## Headscale VPN Configuration

Container VPN enrollment uses the Headscale coordination server:

```bash
HEADSCALE_API_URL=https://headscale.your-domain.com
HEADSCALE_API_KEY=your-api-key        # Bearer token for Headscale REST API
HEADSCALE_USER=milady                  # Headscale user for pre-auth keys
```

## Required Environment Variables

| Variable | Required | Description |
|---|---|---|
| `MILADY_SSH_KEY` | Yes* | Base64-encoded SSH private key |
| `MILADY_SSH_KEY_PATH` | Yes* | Path to SSH key file on disk |
| `MILADY_SSH_USER` | No | SSH username (default: `root`) |
| `HEADSCALE_API_URL` | Yes | Headscale server URL |
| `HEADSCALE_API_KEY` | Yes | Headscale API bearer token |
| `HEADSCALE_USER` | No | Headscale user (default: `milady`) |

\* One of `MILADY_SSH_KEY` or `MILADY_SSH_KEY_PATH` must be set.

## Security Considerations

### Secret Handling
- SSH key material is **never logged** — not in error messages, not in debug output
- Error messages show only the key file's basename, not the full path
- The logger's `redact.context()` auto-redacts fields matching: `privateKey`, `secret`, `password`, `token`, `authKey`, `apiKey`, `sshKey`, `signingKey`
- Host key fingerprints are logged at `warn` level on first connection (TOFU) and at `error` level on mismatch — this is intentional for operator visibility

### Host Key Verification
- **Production:** Set `host_key_fingerprint` in the `docker_nodes` DB table for each node. Connections with mismatched keys are rejected.
- **Development:** TOFU (trust-on-first-use) applies when no fingerprint is configured — the fingerprint is logged for manual verification.

### Serverless Considerations
- SSH connections are ephemeral — no connection pooling persists across Vercel function invocations
- The idle connection eviction timeout (5 min) handles serverless cold-start reconnections
- Base64 key decoding happens in-memory; the decoded key is never written to `/tmp` or any filesystem path

## Vercel Deployment Checklist

1. ☐ Set `MILADY_SSH_KEY` in Vercel encrypted environment variables
2. ☐ Set `MILADY_SSH_USER` if not using `root`
3. ☐ Set `HEADSCALE_API_URL` and `HEADSCALE_API_KEY`
4. ☐ Verify Docker nodes have the corresponding public key in `~/.ssh/authorized_keys`
5. ☐ Set `host_key_fingerprint` in DB for each node (pin host keys)
6. ☐ Test health check endpoint: `POST /api/v1/admin/docker-nodes/{nodeId}/health-check`
7. ☐ Test container logs: `GET /api/v1/admin/docker-containers/{id}/logs`

## Troubleshooting

### "Failed to load SSH key" error
- **Serverless:** Set `MILADY_SSH_KEY` env var with `base64 -w0 < your_key`
- **Traditional:** Verify `MILADY_SSH_KEY_PATH` points to a readable file
- Check the error message for "Set MILADY_SSH_KEY env var" hint

### "HOST KEY MISMATCH" error
- The node's host key changed (reinstall, IP reassignment, or MITM)
- Verify the new fingerprint and update the `host_key_fingerprint` column in `docker_nodes`

### SSH connection timeouts
- Verify the node is reachable from Vercel's edge network
- Check that port 22 (or custom SSH port) is open in the node's firewall
- Vercel functions have a 60s execution limit — long-running SSH operations may timeout
