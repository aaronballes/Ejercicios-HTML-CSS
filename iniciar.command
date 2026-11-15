#!/usr/bin/env bash
# Mac y Linux: instala (la primera vez) y arranca el Reproductor IPTV.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Falta Node.js. Instálalo desde https://nodejs.org (versión 22 o superior) y vuelve a ejecutar esto."
  exit 1
fi
exec node iniciar.mjs
