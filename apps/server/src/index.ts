import { existsSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { config } from './config.js';
import { getCatalog } from './source.js';
import { pipeUpstream, unseal } from './proxy.js';

const app = Fastify({ logger: { level: 'info' } });
await app.register(cookie, { secret: config.secret });

const COOKIE = 'sesion';
const authRequired = Boolean(config.appPassword);
if (!authRequired) {
  app.log.warn('APP_PASSWORD está vacío: la app queda abierta a cualquiera que llegue a este puerto.');
}

const isLogged = (raw?: string) => {
  if (!authRequired) return true;
  if (!raw) return false;
  const r = app.unsignCookie(raw);
  return r.valid && r.value === 'ok';
};

app.addHook('onRequest', async (req, reply) => {
  const path = req.url.split('?')[0];
  if (!path.startsWith('/api/') || path === '/api/login' || path === '/api/session') return;
  if (!isLogged(req.cookies[COOKIE])) return reply.code(401).send({ error: 'No autorizado' });
});

app.get('/api/session', async (req) => ({
  logged: isLogged(req.cookies[COOKIE]),
  authRequired,
}));

app.post<{ Body: { password?: string } }>('/api/login', async (req, reply) => {
  const given = Buffer.from(String(req.body?.password ?? ''));
  const expected = Buffer.from(config.appPassword);
  const ok = authRequired && given.length === expected.length && timingSafeEqual(given, expected);
  if (!ok) {
    await new Promise((r) => setTimeout(r, 500));
    return reply.code(401).send({ error: 'Contraseña incorrecta' });
  }
  reply.setCookie(COOKIE, 'ok', {
    signed: true,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return { ok: true };
});

app.post('/api/logout', async (_req, reply) => {
  reply.clearCookie(COOKIE, { path: '/' });
  return { ok: true };
});

app.get('/api/categories', async (_req, reply) => {
  try {
    const c = await getCatalog();
    return { total: c.channels.length, categories: c.categories, loadedAt: c.loadedAt };
  } catch (err) {
    return reply.code(502).send({ error: (err as Error).message });
  }
});

app.post('/api/refresh', async (_req, reply) => {
  try {
    const c = await getCatalog(true);
    return { total: c.channels.length };
  } catch (err) {
    return reply.code(502).send({ error: (err as Error).message });
  }
});

app.get<{
  Querystring: { category?: string; q?: string; ids?: string; offset?: string; limit?: string };
}>('/api/channels', async (req, reply) => {
  let c;
  try {
    c = await getCatalog();
  } catch (err) {
    return reply.code(502).send({ error: (err as Error).message });
  }
  const { category, ids } = req.query;
  const q = (req.query.q ?? '').trim().toLowerCase();
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));

  let list = c.channels;
  if (ids !== undefined) {
    const wanted = new Set(ids.split(',').filter(Boolean));
    list = list.filter((ch) => wanted.has(ch.id));
  }
  if (category) list = list.filter((ch) => ch.category === category);
  if (q) list = list.filter((ch) => ch.name.toLowerCase().includes(q));

  return {
    total: list.length,
    // La URL real no sale del servidor.
    items: list.slice(offset, offset + limit).map(({ url: _url, ...pub }) => pub),
  };
});

app.get<{ Params: { id: string } }>('/api/stream/:id', async (req, reply) => {
  const c = await getCatalog().catch(() => null);
  const ch = c?.byId.get(req.params.id);
  if (!ch) return reply.code(404).send({ error: 'Canal no encontrado' });
  return pipeUpstream(ch.url, req, reply);
});

app.get<{ Querystring: { t?: string } }>('/api/proxy', async (req, reply) => {
  const url = req.query.t ? unseal(req.query.t) : null;
  if (!url) return reply.code(403).send({ error: 'Enlace no válido' });
  return pipeUpstream(url, req, reply);
});

// En producción el mismo servidor entrega la interfaz ya compilada.
const webDist = fileURLToPath(new URL('../../web/dist', import.meta.url));
if (existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'No encontrado' });
    return reply.sendFile('index.html');
  });
}

await app.listen({ port: config.port, host: '0.0.0.0' });
