import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, Unauthorized, type Category, type Channel, type User } from './api';
import { Users } from './Users';
import { channelStep, detectTv, isBack, isOk, isTextInput, keyDir, moveFocus, saveTv } from './tv';
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

function Login({ onDone }: { onDone: (user: User) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  return (
    <form
      className="login"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          onDone((await api.login(username, password)).user);
        } catch (err) {
          setError((err as Error).message);
        }
      }}
    >
      <h1>Reproductor IPTV</h1>
      <input
        placeholder="Usuario"
        autoFocus
        autoCapitalize="none"
        autoComplete="username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <input
        type="password"
        placeholder="Contraseña"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button type="submit">Entrar</button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

export function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [authRequired, setAuthRequired] = useState(true);

  useEffect(() => {
    api
      .session()
      .then((s) => {
        setAuthRequired(s.authRequired);
        setUser(s.user);
      })
      .catch(() => setUser(null));
  }, []);

  if (user === undefined) return null;
  if (!user) return <Login onDone={setUser} />;
  // La clave hace que favoritos y último canal sean propios de cada usuario.
  return (
    <Main key={user.name} user={user} authRequired={authRequired} onLogout={() => setUser(null)} />
  );
}

function Main({
  user,
  authRequired,
  onLogout,
}: {
  user: User;
  authRequired: boolean;
  onLogout: () => void;
}) {
  const [showUsers, setShowUsers] = useState(false);
  const [tv, setTv] = useState(detectTv);
  // En la tele, "viendo" es el vídeo a pantalla completa sin lista.
  const [watching, setWatching] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [total, setTotal] = useState(0);
  const [category, setCategory] = useState(ALL);
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Channel[]>([]);
  const [found, setFound] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [current, setCurrent] = useStored<Channel | null>(`iptv.current.${user.name}`, null);
  const [favs, setFavs] = useStored<string[]>(`iptv.favs.${user.name}`, []);

  const guard = useCallback((err: unknown) => {
    if (err instanceof Unauthorized) onLogout();
    else setError((err as Error).message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    void loadCategories();
  }, [loadCategories]);

  const query = useMemo(() => {
    if (category === FAVS) return { ids: favs, q };
    return { category: category === ALL ? undefined : category, q };
    // Los favoritos solo cambian la consulta cuando se está viendo esa lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, q, category === FAVS ? favs : null]);

  useEffect(() => {
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
  }, [query, guard, total]);

  const more = () =>
    api
      .channels({ ...query, offset: items.length })
      .then((r) => setItems((prev) => [...prev, ...r.items]))
      .catch(guard);

  const toggleFav = (id: string) =>
    setFavs((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));

  useEffect(() => {
    document.documentElement.classList.toggle('tv', tv);
    if (!tv) setWatching(false);
  }, [tv]);

  // Cambia al canal anterior o siguiente de la lista que se está viendo.
  const zap = useCallback(
    (step: number) => {
      if (items.length === 0) return;
      const i = items.findIndex((ch) => ch.id === current?.id);
      const next = i < 0 ? 0 : (i + step + items.length) % items.length;
      setCurrent(items[next]);
    },
    [items, current, setCurrent],
  );

  useEffect(() => {
    if (!tv) return;
    const onKey = (e: KeyboardEvent) => {
      const dialog = document.querySelector('dialog[open]');
      const dir = keyDir(e);
      const step = channelStep(e);

      if (watching && !dialog) {
        if (dir === 'up' || dir === 'down' || step) zap(step || (dir === 'up' ? -1 : 1));
        else if (dir || isOk(e) || isBack(e)) setWatching(false);
        else return;
        e.preventDefault();
        return;
      }
      if (dialog) {
        if (dir && !(isTextInput(e.target) && (dir === 'left' || dir === 'right'))) {
          e.preventDefault();
          moveFocus(dir, dialog);
        }
        return;
      }
      if (step) {
        e.preventDefault();
        zap(step);
        return;
      }
      if (isBack(e) && current) {
        e.preventDefault();
        setWatching(true);
        return;
      }
      if (!dir) return;
      if (isTextInput(e.target) && (dir === 'left' || dir === 'right')) return;
      e.preventDefault();
      // A la izquierda de la lista está el vídeo: se pasa a pantalla completa.
      if (!moveFocus(dir) && dir === 'left' && current) setWatching(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [tv, watching, zap, current]);

  // Con mando siempre tiene que haber algo enfocado: si el foco se pierde, vuelve a la lista.
  useEffect(() => {
    if (!tv || watching || showUsers) return;
    const active = document.activeElement;
    if (active && active !== document.body && document.body.contains(active)) return;
    const target =
      document.querySelector<HTMLElement>('.channels li.active .channel') ??
      document.querySelector<HTMLElement>('.channels .channel');
    target?.focus();
  }, [tv, watching, showUsers, items]);

  const tabs = [
    { name: ALL, count: total },
    { name: FAVS, count: favs.length },
    ...categories,
  ];

  return (
    <div className={watching ? 'app watching' : 'app'}>
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
        <button
          className="ghost"
          onClick={() => {
            saveTv(!tv);
            setTv(!tv);
          }}
        >
          {tv ? 'Salir del modo tele' : 'Modo tele'}
        </button>
        {user.admin && (
          <button className="ghost" onClick={() => setShowUsers(true)}>
            Usuarios
          </button>
        )}
        {authRequired && (
          <button className="ghost" title={`Sesión de ${user.name}`} onClick={() => api.logout().then(onLogout)}>
            Salir
          </button>
        )}
      </header>

      <main>
        <Player channel={current} tv={tv} />
        {watching && current && (
          <div className="osd" key={current.id}>
            <strong>{current.name}</strong>
            <span>▲▼ cambiar de canal · OK lista de canales</span>
          </div>
        )}


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
                <button
                  className="channel"
                  onClick={() => {
                    setCurrent(ch);
                    if (tv) setWatching(true);
                  }}
                >
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
          {tv && <p className="hint">▲▼ moverse · OK ver · ▶ favorito · ◀ pantalla completa</p>}
        </aside>
      </main>
      {showUsers && <Users onClose={() => setShowUsers(false)} onExpired={onLogout} />}
    </div>
  );
}
