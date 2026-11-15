// Prueba de extremo a extremo en un navegador real. La lanza pruebas/probar.sh.
const { chromium } = require('playwright');
const XTREAM = 'http://127.0.0.1:3100';
const M3U = 'http://127.0.0.1:3101';

const checks = [];
const check = (name, ok) => { checks.push(ok); console.log(`${ok ? '✔' : '✘'} ${name}`); };

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--no-proxy-server'] });
  const errors = [];
  const open = async (url, viewport = { width: 1280, height: 720 }) => {
    const page = await (await browser.newContext({ viewport })).newPage();
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(url);
    return page;
  };
  const login = async (page, user, pass) => {
    await page.fill('input[placeholder=Usuario]', user);
    await page.fill('input[type=password]', pass);
    await page.click('text=Entrar');
  };
  const plays = (page) =>
    page.waitForFunction(() => {
      const v = document.querySelector('video');
      return v && v.currentTime > 1 && v.videoWidth > 0;
    }, null, { timeout: 15000 }).then(() => true, () => false);

  const admin = await open(XTREAM);
  await login(admin, 'admin', 'incorrecta');
  check('rechaza una contraseña incorrecta', await admin.waitForSelector('.login .error').then(() => true, () => false));
  await login(admin, 'admin', 'adminadmin');
  await admin.waitForSelector('.channels li');
  check('el administrador ve los 3 canales', (await admin.locator('.channels li').count()) === 3);
  await admin.click('text=Canal Uno HD');
  check('reproduce HLS (fuente Xtream)', await plays(admin));
  await admin.click('text=Canal Roto');
  check('avisa cuando un canal falla', await admin.waitForSelector('.player-msg.error').then(() => true, () => false));
  await admin.fill('input[type=search]', 'dos');
  await admin.waitForFunction(() => document.querySelectorAll('.channels li').length === 1);
  check('el buscador filtra', true);

  await admin.click('text=Usuarios');
  await admin.fill('dialog input[placeholder="Nombre de usuario"]', 'ana');
  await admin.fill('dialog input[type=password]', 'corta');
  await admin.click('text=Añadir usuario');
  check('rechaza contraseñas cortas', await admin.waitForSelector('dialog .error').then(() => true, () => false));
  await admin.fill('dialog input[type=password]', 'clave-de-ana');
  await admin.click('text=Añadir usuario');
  await admin.waitForSelector('dialog .notice');
  check('crea un usuario', (await admin.locator('dialog li .name').allTextContents()).includes('ana'));

  const ana = await open(XTREAM, { width: 390, height: 800 });
  await login(ana, 'ana', 'clave-de-ana');
  await ana.waitForSelector('.channels li');
  check('el usuario nuevo entra y no ve la gestión de usuarios', (await ana.locator('header >> text=Usuarios').count()) === 0);
  check('un usuario normal no puede llamar a la API de usuarios', (await ana.request.get(`${XTREAM}/api/users`)).status() === 403);
  const manifest = await (await ana.request.get(`${XTREAM}/api/stream/1`)).text();
  check('el navegador no recibe la dirección ni las credenciales del proveedor', !/4010|\/u\/p\//.test(manifest));

  admin.on('dialog', (d) => d.accept());
  await admin.click('dialog >> text=Eliminar');
  await admin.waitForFunction(() => document.querySelectorAll('dialog li').length === 0);
  check('al eliminar al usuario se le cierra la sesión', (await ana.request.get(`${XTREAM}/api/channels`)).status() === 401);

  const libre = await open(M3U);
  await libre.waitForSelector('.channels li');
  await libre.click('text=Canal TS');
  check('reproduce MPEG-TS (fuente M3U)', await plays(libre));

  // --- Smart TV: navegador de tele, solo con las teclas del mando ---
  const TV_UA = 'Mozilla/5.0 (SMART-TV; Linux; Tizen 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/5.0 TV Safari/537.36';
  const tvCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, userAgent: TV_UA });
  const tv = await tvCtx.newPage();
  tv.on('pageerror', (e) => errors.push(String(e)));
  await tv.goto(M3U);
  await tv.waitForSelector('.channels li');
  const focused = () => tv.evaluate(() => {
    const el = document.activeElement;
    return `${el.className || el.tagName.toLowerCase()}:${(el.textContent || el.placeholder || '').trim()}`;
  });
  const watching = () => tv.evaluate(() => document.querySelector('.app').classList.contains('watching'));
  const press = async (key) => { await tv.keyboard.press(key); await tv.waitForTimeout(150); };

  check('tele: se activa sola y enfoca el primer canal', (await tv.evaluate(() => document.documentElement.classList.contains('tv'))) && (await focused()) === 'channel:Canal HLS');
  await press('ArrowDown');
  check('tele: flecha abajo pasa al canal siguiente', (await focused()) === 'channel:Canal TS');
  if (process.env.CAPTURAS) await tv.screenshot({ path: `${process.env.CAPTURAS}/tele-lista.png` });
  await press('Enter');
  check('tele: OK pone el canal a pantalla completa', (await watching()) && (await plays(tv)));
  await press('ArrowUp');
  check('tele: flecha arriba cambia de canal viendo la tele', (await tv.textContent('.osd strong')) === 'Canal HLS' && (await plays(tv)));
  if (process.env.CAPTURAS) await tv.screenshot({ path: `${process.env.CAPTURAS}/tele-viendo.png` });
  await press('PageDown');
  check('tele: la tecla de canal + / - también cambia', (await tv.textContent('.osd strong')) === 'Canal TS');
  await press('Enter');
  check('tele: OK vuelve a la lista con el foco en el canal actual', !(await watching()) && (await focused()) === 'channel:Canal TS');
  await press('ArrowRight');
  await press('Enter');
  check('tele: flecha derecha y OK marcan favorito', (await tv.locator('.fav.on').count()) === 1);
  await press('ArrowLeft');
  await press('ArrowLeft');
  check('tele: flecha izquierda desde la lista va a pantalla completa', await watching());
  await press('Escape');
  check('tele: "atrás" vuelve a la lista', !(await watching()));
  await press('ArrowUp'); await press('ArrowUp');
  const onSelect = await tv.evaluate(() => document.activeElement.tagName);
  await press('ArrowUp'); await press('ArrowUp');
  check('tele: se llega con las flechas a categorías, buscador y botones de arriba', onSelect === 'SELECT' && (await focused()).startsWith('ghost:'));

  // La versión para navegadores antiguos también tiene que arrancar.
  const old = await tvCtx.newPage();
  old.on('pageerror', (e) => errors.push(`antiguo: ${e}`));
  await old.route(M3U + '/', async (route) => {
    const res = await route.fetch();
    const html = (await res.text())
      .replace(/<script type="module"[^>]*>[\s\S]*?<\/script>/g, '')
      .replace(/<link rel="modulepreload"[^>]*>/g, '')
      .replace(/ nomodule/g, '');
    await route.fulfill({ response: res, body: html });
  });
  await old.goto(M3U + '/');
  check('tele: la versión para navegadores antiguos carga la lista', await old.waitForSelector('.channels li', { timeout: 10000 }).then(() => true, () => false));

  check('sin errores de JavaScript', errors.length === 0);
  if (errors.length) console.log(errors);
  await browser.close();
  process.exit(checks.every(Boolean) ? 0 : 1);
})().catch((e) => { console.error('FALLO:', e.message); process.exit(1); });
