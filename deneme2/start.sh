#!/bin/sh

# Fix volume permissions
mkdir -p /app/data/uploads/benchmarks
chown -R 1001:1001 /app/data 2>/dev/null || true

export HOME=/home/nextjs

# DB migrate + seed
su -s /bin/sh -c 'export HOME=/home/nextjs && node node_modules/prisma/build/index.js db push --skip-generate' nextjs
su -s /bin/sh -c 'export HOME=/home/nextjs && node prisma/seed.mjs' nextjs

echo "[Start] Starting worker process in background..."
su -s /bin/sh -c 'export HOME=/home/nextjs && node worker.mjs' nextjs &

echo "[Start] Starting Next.js server..."
exec su -s /bin/sh -c 'export HOME=/home/nextjs && exec node server.js' nextjs
