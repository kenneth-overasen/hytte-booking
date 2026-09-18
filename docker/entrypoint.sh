#!/bin/sh
set -e

# Build DATABASE_URL from the discrete POSTGRES_* variables, percent-encoding
# user and password.
#
# This is done here rather than by interpolating in docker-compose.yml because
# a password from `openssl rand -base64` routinely contains "/" or "+", and a
# raw "/" or "@" silently corrupts the connection string — Prisma then reports
# the confusing "P1013: invalid port number in database URL".
#
# An explicitly provided DATABASE_URL always wins, so an external database can
# still be pointed at directly.
if [ -z "${DATABASE_URL:-}" ]; then
  DATABASE_URL=$(node -e '
const e = encodeURIComponent;
const user = e(process.env.POSTGRES_USER || "hytte");
const pass = e(process.env.POSTGRES_PASSWORD || "");
const host = process.env.POSTGRES_HOST || "db";
const port = process.env.POSTGRES_PORT || "5432";
const name = e(process.env.POSTGRES_DB || "hytte");
const params = process.env.DATABASE_PARAMS || "schema=public&connection_limit=10";
process.stdout.write(`postgresql://${user}:${pass}@${host}:${port}/${name}?${params}`);
')
  export DATABASE_URL
fi

exec "$@"
