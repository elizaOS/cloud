#!/bin/bash
# Load .env.local vars
set -a
source /home/shad0w/projects/eliza-cloud-v2-milady-pack/.env.local
set +a

export NEXT_DIST_DIR=.next-build
export PORT=3000
export NODE_ENV=production

cd /home/shad0w/projects/eliza-cloud-v2-milady-pack
exec node_modules/.bin/next start -p 3000
