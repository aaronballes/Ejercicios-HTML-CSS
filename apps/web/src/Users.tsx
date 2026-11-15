import { useEffect, useRef, useState } from 'react';
import { api, Unauthorized, type Account } from './api';

export function Users({ onClose, onExpired }: { onClose: () => void; onExpired: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const run = (action: Promise<{ users: Account[] }>, done = '') =>
    action
      .then((r) => {
        setAccounts(r.users);
        setError('');
        setNotice(done);
        return true;
      })
      .catch((err) => {
        if (err instanceof Unauthorized) onExpired();
        else setError((err as Error).message);
        setNotice('');
        return false;
      });

  useEffect(() => {
    dialog.current?.showModal();
    void run(api.users());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <dialog ref={dialog} className="users" onClose={onClose}>
      <h2>Usuarios</h2>

      {accounts && accounts.length === 0 && (
        <p className="empty">Todavía no hay usuarios. Crea el primero aquí abajo.</p>
      )}
      <ul>
        {accounts?.map((a) => (
          <li key={a.name}>
            <span className="name">{a.name}</span>
            <button
              className="ghost"
              onClick={() => {
                const p = prompt(`Nueva contraseña para ${a.name} (mínimo 8 caracteres)`);
                if (p) void run(api.setPassword(a.name, p), `Contraseña de ${a.name} cambiada.`);
              }}
            >
              Cambiar contraseña
            </button>
            <button
              className="ghost danger"
              onClick={() => {
                if (confirm(`¿Eliminar a ${a.name}? Se cerrará su sesión.`)) {
                  void run(api.deleteUser(a.name), `${a.name} eliminado.`);
                }
              }}
            >
              Eliminar
            </button>
          </li>
        ))}
      </ul>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run(api.createUser(username, password), `Usuario ${username.trim().toLowerCase()} creado.`)) {
            setUsername('');
            setPassword('');
          }
        }}
      >
        <input
          placeholder="Nombre de usuario"
          autoCapitalize="none"
          autoComplete="off"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          type="password"
          placeholder="Contraseña (mínimo 8)"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit">Añadir usuario</button>
      </form>

      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}
      <button className="ghost close" onClick={() => dialog.current?.close()}>
        Cerrar
      </button>
    </dialog>
  );
}
