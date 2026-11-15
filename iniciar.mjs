// Instala (la primera vez) y arranca el Reproductor IPTV.
// Se lanza con iniciar.bat en Windows o iniciar.sh en Mac y Linux.
import { execSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

// fileURLToPath: así funciona aunque la carpeta tenga espacios o tildes.
process.chdir(fileURLToPath(new URL('.', import.meta.url)));
const say = (text = '') => console.log(text);
const title = (text) => say(`\n=== ${text} ===`);

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 9)) {
  say(`Hace falta Node.js 22.9 o superior y este equipo tiene la ${process.versions.node}.`);
  say('Descarga la versión actual en https://nodejs.org e inténtalo de nuevo.');
  process.exit(1);
}

// ---------- 1. Configuración ----------
if (!existsSync('.env')) {
  title('Configuración (solo se pregunta la primera vez)');
  const rl = createInterface({ input: process.stdin });
  // Cola de líneas: así no se pierde nada si se pega texto o se escribe deprisa.
  const lines = [];
  let waiting = null;
  rl.on('line', (line) => (waiting ? waiting(line) : lines.push(line)));
  rl.on('close', () => waiting && process.exit(1));
  const readLine = () =>
    lines.length ? Promise.resolve(lines.shift()) : new Promise((resolve) => (waiting = (l) => { waiting = null; resolve(l); }));
  const ask = async (question, valid = (v) => v.length > 0, hint = 'No puede quedar vacío.') => {
    for (;;) {
      process.stdout.write(`${question}: `);
      const answer = (await readLine()).trim();
      if (valid(answer)) return answer;
      say(`  ${hint}`);
    }
  };

  say('\nContraseña del administrador. Con ella entrarás tú (usuario "admin") y');
  say('crearás las cuentas de los demás. Lo que escribas se verá en pantalla.');
  const adminPassword = await ask('Contraseña (mínimo 8 caracteres)', (v) => v.length >= 8, 'Tiene que tener al menos 8 caracteres.');

  say('\n¿Qué datos te ha dado tu proveedor de IPTV?');
  say('  1) Una dirección de lista M3U (un enlace largo)');
  say('  2) Servidor, usuario y contraseña (Xtream Codes)');
  const kind = await ask('Escribe 1 o 2', (v) => v === '1' || v === '2', 'Escribe solo 1 o 2.');
  const isUrl = (v) => /^https?:\/\/\S+$/i.test(v);
  const source = { m3u: '', host: '', user: '', pass: '' };
  if (kind === '1') {
    source.m3u = await ask('Dirección de la lista M3U', isUrl, 'Tiene que empezar por http:// o https://');
  } else {
    source.host = await ask('Servidor (por ejemplo http://ejemplo.com:8080)', isUrl, 'Tiene que empezar por http:// o https://');
    source.user = await ask('Usuario');
    source.pass = await ask('Contraseña');
  }
  rl.close();

  writeFileSync('.env', [
    '# Creado por iniciar.mjs. Para cambiar algo, edita este archivo y vuelve a arrancar.',
    '# Para empezar de cero, bórralo y ejecuta de nuevo el instalador.',
    `IPTV_M3U_URL=${source.m3u}`,
    `IPTV_XTREAM_HOST=${source.host}`,
    `IPTV_XTREAM_USER=${source.user}`,
    `IPTV_XTREAM_PASS=${source.pass}`,
    'ADMIN_USER=admin',
    `ADMIN_PASSWORD=${adminPassword}`,
    `APP_SECRET=${randomBytes(32).toString('hex')}`,
    'IPTV_REFRESH_HOURS=6',
    'PORT=3000',
    '',
  ].join('\n'), { mode: 0o600 });
  say('\nConfiguración guardada en el archivo .env');
}

// ---------- 2. Instalación ----------
const run = (command, what) => {
  try {
    execSync(command, { stdio: 'inherit' });
  } catch {
    say(`\nHa fallado ${what}. Revisa el mensaje de arriba; suele ser falta de conexión a internet.`);
    process.exit(1);
  }
};
const builtAt = existsSync('apps/server/dist/index.js') && existsSync('apps/web/dist/index.html')
  ? statSync('apps/server/dist/index.js').mtimeMs
  : 0;
if (!existsSync('node_modules') || statSync('package-lock.json').mtimeMs > builtAt) {
  title('Descargando lo necesario (tarda uno o dos minutos)');
  run('npm install --no-fund --no-audit', 'la descarga');
}
if (!builtAt || statSync('package-lock.json').mtimeMs > builtAt) {
  title('Preparando la aplicación');
  run('npm run build', 'la preparación');
}

// ---------- 3. Arranque ----------
const port = (readFileSync('.env', 'utf8').match(/^PORT=(\d+)/m) ?? [])[1] ?? '3000';
const addresses = Object.values(networkInterfaces())
  .flat()
  .filter((n) => n && n.family === 'IPv4' && !n.internal)
  .map((n) => `http://${n.address}:${port}`);

title('Reproductor IPTV en marcha');
say(`En este ordenador:        http://localhost:${port}`);
if (addresses.length) say(`En la tele o el móvil:    ${addresses.join('   o   ')}`);
else say('No he encontrado la dirección de este equipo en la red: ¿está conectado a la wifi?');
say('\nUsuario: admin    Contraseña: la que elegiste al configurar');
say('La tele y el móvil tienen que estar en la misma wifi que este ordenador.');
say('Si Windows pregunta si permite el acceso a la red, acepta.');
say('\nDeja esta ventana abierta. Para parar, ciérrala o pulsa Ctrl + C.\n');

const server = spawn(process.execPath, ['--env-file=.env', 'apps/server/dist/index.js'], {
  stdio: 'inherit',
  env: { ...process.env, LOG_LEVEL: 'warn' },
});
server.on('exit', (code) => process.exit(code ?? 0));
