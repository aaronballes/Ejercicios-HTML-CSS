import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyReply } from 'fastify';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { config } from './config.js';
import { getCatalog } from './source.js';
import { pipeUpstream, unseal } from './proxy.js';
import {
  authenticate,
  createUser,
  deleteUser,
  issueSession,
  listUsers,
  loadUsers,
  readSession,
  setPassword,
  UserError,
  type SessionUser,
} from './users.js';

const app = Fastify({ logger: { level: 'info' } });
await app.register(cookie, { secret: config.secret });

const COOKIE = 'sesion';
const authRequired = Boolean(config.admin.password);
if (!authRequired) {
  app.log.warn('ADMIN_PASSWORD está vacío: la app queda abierta, sin cuentas, a cualquiera que llegue a este puerto.');
}
await loadUsers();

const OPEN_USER: SessionUser = { name: '', admin: false };

function currentUser(raw?: string): SessionUser | null {
  if (!authRequired) return OPEN_USER;
  if (!raw) return null;
  const r = app.unsignCookie(raw);
  return r.valid && r.value ? readSession(r.value) : null;
}

app.addHook('onRequest', async (req, reply) => {
  const path = req.url.split('?')[0];
  if (!path.startsWith('/api/') || path === '/api/login' || path === '/api/session') return;
  const user = currentUser(req.cookies[COOKIE]);
  if (!user) return reply.code(401).send({ error: 'No autorizado' });
  if (path.startsWith('/api/users') && !user.admin) {
    return reply.code(403).send({ error: 'Solo el administrador puede gestionar usuarios' });
  }
});

app.get('/api/session', async (req) => {
  const user = currentUser(req.cookies[COOKIE]);
  return { logged: Boolean(user), authRequired, user };
});

// Freno a los intentos de adivinar contraseñas: 5 fallos por IP y se bloquea 10 minutos.
const MAX_FAILS = 5;
const BLOCK_MS = 10 * 60_000;
const fails = new Map<string, { count: number; until: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [ip, f] of fails) if (f.until < now) fails.delete(ip);
}, 60_000).unref();

app.post<{ Body: { username?: string; password?: string } }>('/api/login', async (req, reply) => {
  const now = Date.now();
  const f = fails.get(req.ip);
  if (f && f.count >= MAX_FAILS && f.until > now) {
    return reply.code(429).send({ error: 'Demasiados intentos. Espera unos minutos.' });
  }
  const user = authRequired ? await authenticate(req.body?.username, req.body?.password) : null;
  if (!user) {
    const prev = f && f.until > now ? f.count : 0;
    fails.set(req.ip, { count: prev + 1, until: now + BLOCK_MS });
    return reply.code(401).send({ error: 'Usuario o contraseña incorrectos' });
  }
  fails.delete(req.ip);
  reply.setCookie(COOKIE, issueSession(user.name), {
    signed: true,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return { ok: true, user };
});

app.post('/api/logout', async (_req, reply) => {
  reply.clearCookie(COOKIE, { path: '/' });
  return { ok: true };
});

const userAction = async (reply: FastifyReply, action: () => Promise<void>) => {
  try {
    await action();
    return { users: listUsers() };
  } catch (err) {
    if (err instanceof UserError) return reply.code(400).send({ error: err.message });
    throw err;
  }
};

app.get('/api/users', async () => ({ users: listUsers() }));

app.post<{ Body: { username?: string; password?: string } }>('/api/users', (req, reply) =>
  userAction(reply, () => createUser(req.body?.username, req.body?.password)),
);

app.put<{ Params: { name: string }; Body: { password?: string } }>(
  '/api/users/:name/password',
  (req, reply) => userAction(reply, () => setPassword(req.params.name, req.body?.password)),
);

app.delete<{ Params: { name: string } }>('/api/users/:name', (req, reply) =>
  userAction(reply, () => deleteUser(req.params.name)),
);

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
