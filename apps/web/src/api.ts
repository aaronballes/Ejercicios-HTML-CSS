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

export interface User {
  name: string;
  admin: boolean;
}

export interface Account {
  name: string;
  createdAt: number;
}

export class Unauthorized extends Error {}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const body = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/api/login') throw new Unauthorized();
  if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`);
  return body as T;
}

export const api = {
  session: () => call<{ logged: boolean; authRequired: boolean; user: User | null }>('/api/session'),
  login: (username: string, password: string) =>
    call<{ ok: true; user: User }>('/api/login', json('POST', { username, password })),
  users: () => call<{ users: Account[] }>('/api/users'),
  createUser: (username: string, password: string) =>
    call<{ users: Account[] }>('/api/users', json('POST', { username, password })),
  setPassword: (name: string, password: string) =>
    call<{ users: Account[] }>(`/api/users/${encodeURIComponent(name)}/password`, json('PUT', { password })),
  deleteUser: (name: string) =>
    call<{ users: Account[] }>(`/api/users/${encodeURIComponent(name)}`, { method: 'DELETE' }),
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
