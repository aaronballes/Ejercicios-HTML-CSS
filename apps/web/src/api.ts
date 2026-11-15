export interface Channel {
  id: string;
  name: string;
  logo: string;
  category: string;
  kind: 'hls' | 'mpegts';
}

export interface Category {
  name: string;
  count: number;
}

export class Unauthorized extends Error {}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (res.status === 401) throw new Unauthorized();
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`);
  return body as T;
}

export const api = {
  session: () => call<{ logged: boolean; authRequired: boolean }>('/api/session'),
  login: (password: string) =>
    call<{ ok: true }>('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    }),
  logout: () => call<{ ok: true }>('/api/logout', { method: 'POST' }),
  refresh: () => call<{ total: number }>('/api/refresh', { method: 'POST' }),
  categories: () => call<{ total: number; categories: Category[] }>('/api/categories'),
  channels: (p: { category?: string; q?: string; ids?: string[]; offset?: number }) => {
    const qs = new URLSearchParams();
    if (p.category) qs.set('category', p.category);
    if (p.q) qs.set('q', p.q);
    if (p.ids) qs.set('ids', p.ids.join(','));
    if (p.offset) qs.set('offset', String(p.offset));
    return call<{ total: number; items: Channel[] }>(`/api/channels?${qs}`);
  },
};
