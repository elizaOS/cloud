# Cloudflare Container Deployment - Quick Reference

## Required API Token Permissions

Create a Custom Token at: https://dash.cloudflare.com/profile/api-tokens

**Account Permissions (exact names from Cloudflare):**
- ✅ `Containers` → **Edit**
- ✅ `Workers Scripts` → **Edit**  
- ✅ `Account Settings` → **Read**

**Or use:** "Edit Cloudflare Workers" template + manually add "Containers: Edit"

## Files You Need

1. **`bootstrapper/README.md`** - Complete bootstrapper documentation
2. **`README.md`** - Main README (Cloudflare section)  
3. **`bootstrapper/deploy-to-cloudflare.sh`** - Deployment script
4. **`scripts/check-bootstrapper-config.ts`** - Config validation tool

## Quick Deploy (Copy/Paste)

```bash
# 1. Install & login
npm install -g wrangler
wrangler login

# 2. Deploy bootstrapper  
cd /Users/cjft/Documents/git/eliza/eliza-cloud-v2/bootstrapper
./deploy-to-cloudflare.sh v1.0.0

# 3. Get account ID
wrangler whoami

# 4. Update .env
cd ..
# Edit .env and add:
# BOOTSTRAPPER_IMAGE_TAG=registry.cloudflare.com/YOUR_ACCOUNT_ID/elizaos-bootstrapper:latest
# CLOUDFLARE_ACCOUNT_ID=your_account_id
# CLOUDFLARE_API_TOKEN=your_api_token
# R2_ACCESS_KEY_ID=your_r2_key
# R2_SECRET_ACCESS_KEY=your_r2_secret
# R2_BUCKET_NAME=eliza-artifacts
# R2_ENDPOINT=https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com

# 5. Verify config
tsx scripts/check-bootstrapper-config.ts

# 6. Start
npm run build && npm start

# 7. Deploy agents
cd your-project
elizaos deploy --name my-agent
```

## What Was Changed

**Removed these incorrect/redundant files:**
- ~~BOOTSTRAPPER_DEPLOYMENT_QUICKSTART.md~~
- ~~DEPLOYMENT_SUMMARY.md~~
- ~~CLOUDFLARE_CONTAINERS_EXPLAINED.md~~
- ~~CLOUDFLARE_DEPLOYMENT_FLOW.md~~
- ~~CORRECT_DEPLOYMENT_QUICKSTART.md~~
- ~~CLOUDFLARE_CORRECT_DEPLOYMENT.md~~
- ~~START_HERE.md~~
- ~~CORRECTION_NOTICE.md~~
- ~~bootstrapper/deploy-to-registry.sh~~ (Docker Hub script)

**Kept these essential files:**
- ✅ `bootstrapper/README.md` (updated)
- ✅ `README.md` (concise Cloudflare section)
- ✅ `bootstrapper/deploy-to-cloudflare.sh` (correct script)
- ✅ `scripts/check-bootstrapper-config.ts` (useful tool)

## Key Points

- Cloudflare HAS its own registry at `registry.cloudflare.com`
- Use `wrangler` CLI to push images
- No Docker Hub or GitHub Container Registry needed
- Images stored at: `registry.cloudflare.com/ACCOUNT_ID/IMAGE:TAG`

## Getting Help

- **Full guide:** `bootstrapper/README.md`
- **Config checker:** `tsx scripts/check-bootstrapper-config.ts`
- **Cloudflare docs:** https://developers.cloudflare.com/containers/

