#!/usr/bin/env bash
# Compila, arranca un proveedor falso y dos servidores (Xtream con cuentas, M3U abierto)
# y pasa la prueba de navegador. Necesita ffmpeg y Playwright con Chromium.
set -euo pipefail
cd "$(dirname "$0")/.."
export NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost
tmp=$(mktemp -d)
pids=()
trap 'kill "${pids[@]}" 2>/dev/null || true; rm -rf "$tmp"' EXIT

npm run build >/dev/null
node pruebas/proveedor-falso.mjs >"$tmp/proveedor.log" 2>&1 & pids+=($!)
env -u IPTV_M3U_URL DATA_DIR="$tmp/a" PORT=3100 ADMIN_USER=admin ADMIN_PASSWORD=adminadmin \
  IPTV_XTREAM_HOST=http://127.0.0.1:4010 IPTV_XTREAM_USER=u IPTV_XTREAM_PASS=p \
  node apps/server/dist/index.js >"$tmp/xtream.log" 2>&1 & pids+=($!)
env -u IPTV_XTREAM_HOST -u ADMIN_PASSWORD -u APP_PASSWORD DATA_DIR="$tmp/b" PORT=3101 \
  IPTV_M3U_URL=http://127.0.0.1:4010/list.m3u \
  node apps/server/dist/index.js >"$tmp/m3u.log" 2>&1 & pids+=($!)

for port in 4010 3100 3101; do
  for _ in $(seq 50); do
    curl -s -o /dev/null "http://127.0.0.1:$port/" && break
    sleep 0.2
  done
done
NODE_PATH="${NODE_PATH:-$(npm root -g)}" node pruebas/e2e.cjs || { tail -n 20 "$tmp"/*.log; exit 1; }
