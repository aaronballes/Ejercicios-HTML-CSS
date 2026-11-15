import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from './config.js';

interface StoredUser {
  name: string;
  salt: string;
  hash: string;
  createdAt: number;
}

export interface SessionUser {
  name: string;
  admin: boolean;
}

export class UserError extends Error {}

const file = join(config.dataDir, 'users.json');
let users: StoredUser[] = [];

const derive = (password: string, salt: string) =>
  new Promise<string>((resolve, reject) =>
    scrypt(password, salt, 64, (err, key) => (err ? reject(err) : resolve(key.toString('hex')))),
  );

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

const mac = (value: string) =>
  createHmac('sha256', config.secret).update(value).digest('base64url').slice(0, 22);

export async function loadUsers() {
  try {
    users = JSON.parse(await readFile(file, 'utf8'));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    users = [];
  }
}

async function save() {
  await mkdir(config.dataDir, { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(users, null, 2), { mode: 0o600 });
  await rename(tmp, file);
}

const normalize = (name: unknown) => String(name ?? '').trim().toLowerCase();

function checkPassword(password: unknown): string {
  const p = String(password ?? '');
  if (p.length < 8) throw new UserError('La contraseña debe tener al menos 8 caracteres');
  if (p.length > 200) throw new UserError('La contraseña es demasiado larga');
  return p;
}

/**
 * La sesión lleva una huella de la contraseña vigente: al cambiarla o borrar
 * la cuenta, las sesiones abiertas de ese usuario dejan de valer.
 */
function fingerprint(name: string): string | null {
  if (name === config.admin.user) return config.admin.password ? mac(`admin:${config.admin.password}`) : null;
  const u = users.find((x) => x.name === name);
  return u ? mac(`user:${u.name}:${u.hash}`) : null;
}

export function issueSession(name: string): string {
  return `${name}|${fingerprint(name)}`;
}

export function readSession(value: string): SessionUser | null {
  const i = value.lastIndexOf('|');
  if (i < 0) return null;
  const name = value.slice(0, i);
  const fp = fingerprint(name);
  if (!fp || !same(fp, value.slice(i + 1))) return null;
  return { name, admin: name === config.admin.user };
}

export async function authenticate(username: unknown, password: unknown): Promise<SessionUser | null> {
  const name = normalize(username);
  const pass = String(password ?? '');
  if (name === config.admin.user) {
    return config.admin.password && same(mac(pass), mac(config.admin.password))
      ? { name, admin: true }
      : null;
  }
  const u = users.find((x) => x.name === name);
  // Se calcula el hash aunque el usuario no exista, para no delatar qué nombres hay.
  const hash = await derive(pass, u?.salt ?? 'no-existe');
  return u && same(hash, u.hash) ? { name, admin: false } : null;
}

export const listUsers = () =>
  users.map(({ name, createdAt }) => ({ name, createdAt })).sort((a, b) => a.name.localeCompare(b.name));

export async function createUser(username: unknown, password: unknown) {
  const name = normalize(username);
  if (!/^[a-z0-9._-]{3,32}$/.test(name)) {
    throw new UserError('El nombre debe tener de 3 a 32 caracteres: letras, números, punto, guion o guion bajo');
  }
  if (name === config.admin.user || users.some((u) => u.name === name)) {
    throw new UserError('Ya existe un usuario con ese nombre');
  }
  const pass = checkPassword(password);
  const salt = randomBytes(16).toString('hex');
  users.push({ name, salt, hash: await derive(pass, salt), createdAt: Date.now() });
  await save();
}

export async function setPassword(username: string, password: unknown) {
  const u = users.find((x) => x.name === normalize(username));
  if (!u) throw new UserError('Ese usuario no existe');
  const pass = checkPassword(password);
  u.salt = randomBytes(16).toString('hex');
  u.hash = await derive(pass, u.salt);
  await save();
}

export async function deleteUser(username: string) {
  const name = normalize(username);
  if (!users.some((u) => u.name === name)) throw new UserError('Ese usuario no existe');
  users = users.filter((u) => u.name !== name);
  await save();
}
