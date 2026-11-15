import { config, usesXtream } from './config.js';

export interface Channel {
  id: string;
  name: string;
  logo: string;
  category: string;
  kind: 'hls' | 'mpegts';
  /** URL real del proveedor. Contiene credenciales: nunca se envía al navegador. */
  url: string;
}

interface Catalog {
  channels: Channel[];
  byId: Map<string, Channel>;
  categories: { name: string; count: number }[];
  loadedAt: number;
}

let catalog: Catalog | null = null;
let loading: Promise<Catalog> | null = null;

const kindOf = (url: string): Channel['kind'] =>
  /\.m3u8?($|\?)/i.test(url) ? 'hls' : 'mpegts';

export function parseM3u(text: string): Omit<Channel, 'id'>[] {
  const out: Omit<Channel, 'id'>[] = [];
  let pending: { name: string; logo: string; category: string } | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('#EXTINF')) {
      const attr = (k: string) => line.match(new RegExp(`${k}="([^"]*)"`))?.[1] ?? '';
      const comma = line.lastIndexOf(',');
      pending = {
        name: (comma >= 0 ? line.slice(comma + 1).trim() : '') || attr('tvg-name') || 'Sin nombre',
        logo: attr('tvg-logo'),
        category: attr('group-title') || 'Sin categoría',
      };
    } else if (line && !line.startsWith('#') && pending) {
      out.push({ ...pending, url: line, kind: kindOf(line) });
      pending = null;
    }
  }
  return out;
}

async function getText(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`El proveedor respondió ${res.status}`);
  return res.text();
}

async function loadXtream(): Promise<Omit<Channel, 'id'>[]> {
  const { host, user, pass } = config.xtream;
  const api = (action: string) =>
    `${host}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}&action=${action}`;
  const [cats, streams] = await Promise.all([
    getText(api('get_live_categories')).then((t) => JSON.parse(t)),
    getText(api('get_live_streams')).then((t) => JSON.parse(t)),
  ]);
  if (!Array.isArray(cats) || !Array.isArray(streams)) {
    throw new Error('Respuesta inesperada del proveedor (¿credenciales incorrectas?)');
  }
  const catName = new Map<string, string>(
    cats.map((c: any) => [String(c.category_id), String(c.category_name)]),
  );
  return streams.map((s: any) => ({
    name: String(s.name ?? 'Sin nombre'),
    logo: String(s.stream_icon ?? ''),
    category: catName.get(String(s.category_id)) ?? 'Sin categoría',
    kind: 'hls' as const,
    url: `${host}/live/${encodeURIComponent(user)}/${encodeURIComponent(pass)}/${s.stream_id}.m3u8`,
  }));
}

async function load(): Promise<Catalog> {
  let items: Omit<Channel, 'id'>[];
  if (usesXtream()) items = await loadXtream();
  else if (config.m3uUrl) items = parseM3u(await getText(config.m3uUrl));
  else throw new Error('No hay fuente configurada: rellena IPTV_M3U_URL o IPTV_XTREAM_* en .env');

  const channels = items.map((c, i) => ({ ...c, id: String(i + 1) }));
  const counts = new Map<string, number>();
  for (const c of channels) counts.set(c.category, (counts.get(c.category) ?? 0) + 1);
  return {
    channels,
    byId: new Map(channels.map((c) => [c.id, c])),
    categories: [...counts].map(([name, count]) => ({ name, count })),
    loadedAt: Date.now(),
  };
}

export async function getCatalog(force = false): Promise<Catalog> {
  const stale = !catalog || Date.now() - catalog.loadedAt > config.refreshHours * 3_600_000;
  if (!force && !stale) return catalog!;
  loading ??= load()
    .then((c) => (catalog = c))
    .finally(() => (loading = null));
  try {
    return await loading;
  } catch (err) {
    // Si falla una recarga, se sigue sirviendo la lista anterior.
    if (catalog && !force) return catalog;
    throw err;
  }
}
