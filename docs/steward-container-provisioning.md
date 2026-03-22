# Steward-aware container provisioning

Updated the Docker sandbox orchestrator so newly provisioned Milady containers are created with Steward integration by default.

## What changed

- Default Docker image now falls back to `milady/agent:v2.0.0-steward-2`
  - Overrideable with `MILADY_DOCKER_IMAGE`
- New containers now receive these env vars automatically:
  - `MILADY_CLOUD_PROVISIONED=1`
  - `STEWARD_API_URL=http://localhost:3200`
  - `STEWARD_AGENT_ID=<agent-id>`
  - `STEWARD_AGENT_TOKEN=<minted during provisioning>`
- Provisioning now registers the agent in Steward on the target node before container start:
  - `POST /agents`
  - `POST /agents/:agentId/token`
- New containers are attached to `milady-isolated` by default
  - Overrideable with `MILADY_DOCKER_NETWORK`
- Docker healthcheck now targets `MILADY_PORT` instead of legacy `ELIZA_PORT`

## Scope

These changes only affect newly created Docker sandboxes. Running containers are not modified.
