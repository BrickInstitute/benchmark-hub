#!/bin/sh

# Fix volume permissions
mkdir -p /app/data/uploads/benchmarks
chown -R 1001:1001 /app/data 2>/dev/null || true

export HOME=/home/nextjs

# DB migrate + seed (categories/tags only - the criteria catalogue is seeded
# separately via scripts/seed-criteria.ts, not part of container boot).
#
# A failure here used to be silently swallowed (no exit-code check), so the
# server would boot against a stale schema. That is how production ran for
# months missing columns a live query needed, 500ing on exactly those rows
# until someone happened to click into one - instead of failing loudly on the
# one deploy that actually changed the schema. Fail the boot instead: a
# container that won't start is visible in Railway within seconds; a column
# that silently never got added is invisible until a user hits it.
if ! su -s /bin/sh -c 'export HOME=/home/nextjs && node node_modules/prisma/build/index.js db push --skip-generate' nextjs; then
  echo "[Start] db push failed - refusing to boot against a stale schema." >&2
  echo "[Start] If this is a data-loss warning, resolve it by hand (inspect what would be dropped, then re-run with --accept-data-loss deliberately) - never add that flag here." >&2
  exit 1
fi
su -s /bin/sh -c 'export HOME=/home/nextjs && node prisma/seed.mjs' nextjs

echo "[Start] Starting Next.js server..."
exec su -s /bin/sh -c 'export HOME=/home/nextjs && exec node server.js' nextjs
