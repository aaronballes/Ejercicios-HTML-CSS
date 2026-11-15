import { randomBytes } from 'node:crypto';

const env = (k: string) => (process.env[k] ?? '').trim();

export const config = {
  port: Number(env('PORT') || 3000),
  m3uUrl: env('IPTV_M3U_URL'),
  xtream: {
    host: env('IPTV_XTREAM_HOST').replace(/\/+$/, ''),
    user: env('IPTV_XTREAM_USER'),
    pass: env('IPTV_XTREAM_PASS'),
  },
  appPassword: env('APP_PASSWORD'),
  // Firma las cookies de sesión y cifra las URLs del proxy. Si no se fija, cambia en cada arranque.
  secret: env('APP_SECRET') || randomBytes(32).toString('hex'),
  refreshHours: Number(env('IPTV_REFRESH_HOURS') || 6),
};

export const usesXtream = () =>
  Boolean(config.xtream.host && config.xtream.user && config.xtream.pass);
