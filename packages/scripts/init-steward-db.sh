#!/bin/bash
# Creates the 'steward' database used by the Steward auth service.
# Mounted into postgres container via docker-compose at:
#   /docker-entrypoint-initdb.d/20-steward.sh
# The higher numeric prefix ensures this runs after init-db.sh (10-*).
set -e

echo "Creating Steward auth database..."

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
  SELECT 'CREATE DATABASE steward'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'steward')\gexec
  GRANT ALL PRIVILEGES ON DATABASE steward TO $POSTGRES_USER;
EOSQL

echo "Steward database ready."
