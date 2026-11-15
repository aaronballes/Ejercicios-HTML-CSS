import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const env = (k: string) => (process.env[k] ?? '').trim();

export const config = {
  port: Number(env('PORT') || 3000),
  m3uUrl: env('IPTV_M3U_URL'),
  xtream: {
    host: env('IPTV_XTREAM_HOST').replace(/\/+$/, ''),
    user: env('IPTV_XTREAM_USER'),
    pass: env('IPTV_XTREAM_PASS'),
  },
  // El administrador se define aquí y gestiona al resto de usuarios desde la app.
  admin: {
    user: (env('ADMIN_USER') || 'admin').toLowerCase(),
    password: env('ADMIN_PASSWORD') || env('APP_PASSWORD'),
  },
  dataDir: env('DATA_DIR') || fileURLToPath(new URL('../../../data', import.meta.url)),
  // Firma las cookies de sesión y cifra las URLs del proxy. Si no se fija, cambia en cada arranque.
  secret: env('APP_SECRET') || randomBytes(32).toString('hex'),
  refreshHours: Number(env('IPTV_REFRESH_HOURS') || 6),
};

export const usesXtream = () =>
  Boolean(config.xtream.host && config.xtream.user && config.xtream.pass);
