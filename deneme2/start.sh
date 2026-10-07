#!/bin/sh

# Fix volume permissions
mkdir -p /app/data/uploads/benchmarks
chown -R 1001:1001 /app/data 2>/dev/null || true

export HOME=/home/nextjs

# DB migrate + seed
su -s /bin/sh -c 'export HOME=/home/nextjs && node node_modules/prisma/build/index.js db push --skip-generate' nextjs
su -s /bin/sh -c 'export HOME=/home/nextjs && node prisma/seed.mjs' nextjs

# Toplu tarama/puanlama worker'ı yalnızca WORKER_ENABLED=true iken çalışır.
# Varsayılan kapalı: önceliğimiz çok sayıda benchmark toplamak değil, tek bir
# benchmark'ın bölüm bölüm derin analizi. Worker'ı açmak bilinçli bir karar olmalı.
if [ "$WORKER_ENABLED" = "true" ]; then
  echo "[Start] Starting worker process in background (WORKER_ENABLED=true)..."
  su -s /bin/sh -c 'export HOME=/home/nextjs && node worker.mjs' nextjs &
else
  echo "[Start] Worker DISABLED (WORKER_ENABLED is not 'true') - no scraping/scoring will run"
fi

echo "[Start] Starting Next.js server..."
exec su -s /bin/sh -c 'export HOME=/home/nextjs && exec node server.js' nextjs
