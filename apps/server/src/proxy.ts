import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from './config.js';

const key = createHash('sha256').update(config.secret).digest();

/**
 * Las URLs del proveedor llevan usuario y contraseña, así que al navegador solo se le da
 * una versión cifrada. Al estar autenticada, tampoco sirve de proxy abierto.
 */
function seal(url: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([c.update(url, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString('base64url');
}

export function unseal(token: string): string | null {
  try {
    const buf = Buffer.from(token, 'base64url');
    const d = createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}

const proxied = (url: string) => `/api/proxy?t=${seal(url)}`;

/** Reescribe un manifiesto HLS para que todo (variantes, segmentos, claves) pase por el proxy. */
export function rewriteManifest(text: string, baseUrl: string): string {
  const abs = (u: string) => proxied(new URL(u, baseUrl).toString());
  return text
    .split(/\r?\n/)
    .map((line) => {
      const t = line.trim();
      if (!t) return line;
      if (t.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (_m, u) => `URI="${abs(u)}"`);
      return abs(t);
    })
    .join('\n');
}

export async function pipeUpstream(url: string, req: FastifyRequest, reply: FastifyReply) {
  const abort = new AbortController();
  // Al cerrar el navegador se corta la conexión con el proveedor (suele haber límite de conexiones).
  req.raw.on('close', () => abort.abort());

  const headers: Record<string, string> = { 'user-agent': 'VLC/3.0.20 LibVLC/3.0.20' };
  if (req.headers.range) headers.range = req.headers.range;

  let res: Response;
  try {
    res = await fetch(url, { headers, signal: abort.signal, redirect: 'follow' });
  } catch {
    if (abort.signal.aborted) return;
    return reply.code(502).send({ error: 'No se pudo conectar con el proveedor' });
  }
  if (!res.ok || !res.body) {
    return reply.code(502).send({ error: `El proveedor respondió ${res.status}` });
  }

  const type = res.headers.get('content-type') ?? '';
  const finalUrl = res.url || url;
  const isManifest = /mpegurl/i.test(type) || /\.m3u8($|\?)/i.test(finalUrl);

  reply.header('cache-control', 'no-store');
  if (isManifest) {
    const text = await res.text();
    return reply
      .type('application/vnd.apple.mpegurl')
      .send(rewriteManifest(text, finalUrl));
  }

  reply.code(res.status);
  for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
    const v = res.headers.get(h);
    if (v) reply.header(h, v);
  }
  return reply.send(Readable.fromWeb(res.body as any));
}
