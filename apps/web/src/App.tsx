import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, Unauthorized, type Category, type Channel } from './api';
import { Player } from './Player';

const FAVS = '★ Favoritos';
const ALL = 'Todos';

function useStored<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => localStorage.setItem(key, JSON.stringify(value)), [key, value]);
  return [value, setValue] as const;
}

function Login({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  return (
    <form
      className="login"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api.login(password);
          onDone();
        } catch (err) {
          setError((err as Error).message || 'Contraseña incorrecta');
        }
      }}
    >
      <h1>Reproductor IPTV</h1>
      <input
        type="password"
        placeholder="Contraseña"
        autoFocus
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button type="submit">Entrar</button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

export function App() {
  const [session, setSession] = useState<'loading' | 'in' | 'out'>('loading');
  const [authRequired, setAuthRequired] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [total, setTotal] = useState(0);
  const [category, setCategory] = useState(ALL);
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Channel[]>([]);
  const [found, setFound] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [current, setCurrent] = useStored<Channel | null>('iptv.current', null);
  const [favs, setFavs] = useStored<string[]>('iptv.favs', []);

  const guard = useCallback((err: unknown) => {
    if (err instanceof Unauthorized) setSession('out');
    else setError((err as Error).message);
  }, []);

  useEffect(() => {
    api
      .session()
      .then((s) => {
        setAuthRequired(s.authRequired);
        setSession(s.logged ? 'in' : 'out');
      })
      .catch(() => setSession('out'));
  }, []);

  const loadCategories = useCallback(() => {
    setError('');
    return api
      .categories()
      .then((r) => {
        setCategories(r.categories);
        setTotal(r.total);
      })
      .catch(guard);
  }, [guard]);

  useEffect(() => {
    if (session === 'in') void loadCategories();
  }, [session, loadCategories]);

  const query = useMemo(() => {
    if (category === FAVS) return { ids: favs, q };
    return { category: category === ALL ? undefined : category, q };
    // Los favoritos solo cambian la consulta cuando se está viendo esa lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, q, category === FAVS ? favs : null]);

  useEffect(() => {
    if (session !== 'in') return;
    let stale = false;
    setBusy(true);
    const t = setTimeout(() => {
      api
        .channels(query)
        .then((r) => {
          if (stale) return;
          setItems(r.items);
          setFound(r.total);
        })
        .catch((e) => !stale && guard(e))
        .finally(() => !stale && setBusy(false));
    }, 200);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [session, query, guard, total]);

  const more = () =>
    api
      .channels({ ...query, offset: items.length })
      .then((r) => setItems((prev) => [...prev, ...r.items]))
      .catch(guard);

  const toggleFav = (id: string) =>
    setFavs((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));

  if (session === 'loading') return null;
  if (session === 'out') return <Login onDone={() => setSession('in')} />;

  const tabs = [
    { name: ALL, count: total },
    { name: FAVS, count: favs.length },
    ...categories,
  ];

  return (
    <div className="app">
      <header>
        <strong>Reproductor IPTV</strong>
        <span className="now">{current ? current.name : ''}</span>
        <button
          className="ghost"
          title="Volver a descargar la lista del proveedor"
          onClick={() => api.refresh().then(loadCategories).catch(guard)}
        >
          Actualizar lista
        </button>
        {authRequired && (
          <button className="ghost" onClick={() => api.logout().then(() => setSession('out'))}>
            Salir
          </button>
        )}
      </header>

      <main>
        <Player channel={current} />

        <aside>
          <input
            type="search"
            placeholder="Buscar canal…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {tabs.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name} ({c.count})
              </option>
            ))}
          </select>

          {error && <p className="error">{error}</p>}

          <ul className="channels">
            {items.map((ch) => (
              <li key={ch.id} className={current?.id === ch.id ? 'active' : ''}>
                <button className="channel" onClick={() => setCurrent(ch)}>
                  {ch.logo ? (
                    <img src={ch.logo} alt="" loading="lazy" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="nologo" />
                  )}
                  <span className="name">{ch.name}</span>
                </button>
                <button
                  className={`fav ${favs.includes(ch.id) ? 'on' : ''}`}
                  aria-label={favs.includes(ch.id) ? 'Quitar de favoritos' : 'Añadir a favoritos'}
                  onClick={() => toggleFav(ch.id)}
                >
                  ★
                </button>
              </li>
            ))}
          </ul>

          {!busy && !error && items.length === 0 && (
            <p className="empty">
              {category === FAVS && !q
                ? 'Aún no tienes favoritos. Márcalos con la estrella.'
                : 'No hay canales que coincidan.'}
            </p>
          )}
          {items.length < found && (
            <button className="more" onClick={more}>
              Ver más ({found - items.length})
            </button>
          )}
        </aside>
      </main>
    </div>
  );
}
