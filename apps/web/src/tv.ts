// Manejo con mando a distancia: detección de tele, teclas del mando y movimiento del foco.

const TV_UA =
  /Tizen|Web0S|WebOS|SMART-TV|SmartTV|Smart TV|Android TV|AndroidTV|GoogleTV|BRAVIA|AFT[A-Z]|HbbTV|NetCast|VIDAA|Roku|CrKey/i;
const KEY = 'iptv.tv';

/** Modo tele: lo que haya elegido la persona en este aparato o, si no, lo que diga el navegador. */
export function detectTv(): boolean {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) return saved === '1';
  } catch {
    // Sin almacenamiento disponible se decide solo por el navegador.
  }
  return TV_UA.test(navigator.userAgent);
}

export function saveTv(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    // No pasa nada: solo se pierde la preferencia.
  }
}

export type Dir = 'up' | 'down' | 'left' | 'right';

const DIRS: Record<string, Dir> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  Up: 'up', Down: 'down', Left: 'left', Right: 'right',
  38: 'up', 40: 'down', 37: 'left', 39: 'right',
};

export const keyDir = (e: KeyboardEvent): Dir | null => DIRS[e.key] ?? DIRS[e.keyCode] ?? null;

// 10009 es "atrás" en Samsung (Tizen) y 461 en LG (webOS).
export const isBack = (e: KeyboardEvent) =>
  e.key === 'Escape' || e.key === 'GoBack' || e.key === 'BrowserBack' || e.keyCode === 10009 || e.keyCode === 461;

export const isOk = (e: KeyboardEvent) => e.key === 'Enter' || e.keyCode === 13;

/** Teclas de canal +/- del mando (o RePág/AvPág en un teclado). Devuelve -1, 1 o 0. */
export const channelStep = (e: KeyboardEvent): -1 | 0 | 1 => {
  if (e.key === 'ChannelUp' || e.key === 'PageUp' || e.keyCode === 427 || e.keyCode === 33) return -1;
  if (e.key === 'ChannelDown' || e.key === 'PageDown' || e.keyCode === 428 || e.keyCode === 34) return 1;
  return 0;
};

export const isTextInput = (el: EventTarget | null) =>
  el instanceof HTMLInputElement && el.type !== 'checkbox' && el.type !== 'radio';

const FOCUSABLE = 'button, input, select';

/**
 * Lleva el foco al control más cercano en la dirección pulsada, según su posición en pantalla.
 * Devuelve false si no hay nada en esa dirección.
 */
export function moveFocus(dir: Dir, scope: ParentNode & Node = document): boolean {
  const all = Array.prototype.filter.call(
    scope.querySelectorAll(FOCUSABLE),
    (el: HTMLElement & { disabled?: boolean }) => !el.disabled && el.offsetParent !== null,
  ) as HTMLElement[];
  const active = document.activeElement;
  const from = active instanceof HTMLElement && active !== document.body && scope.contains(active) ? active : null;

  if (!from) {
    const start = scope.querySelector<HTMLElement>('.channels li.active .channel') ?? all[0];
    if (start) start.focus();
    return Boolean(start);
  }

  const a = from.getBoundingClientRect();
  const gap = (lo1: number, hi1: number, lo2: number, hi2: number) =>
    Math.max(0, lo2 - hi1, lo1 - hi2);
  let best: HTMLElement | null = null;
  let bestScore = Infinity;

  for (const el of all) {
    if (el === from) continue;
    const b = el.getBoundingClientRect();
    const ahead =
      dir === 'up' ? a.top - b.bottom
      : dir === 'down' ? b.top - a.bottom
      : dir === 'left' ? a.left - b.right
      : b.left - a.right;
    if (ahead < -1) continue;
    const aside =
      dir === 'up' || dir === 'down'
        ? gap(a.left, a.right, b.left, b.right)
        : gap(a.top, a.bottom, b.top, b.bottom);
    // Se prefiere lo que está alineado con el control actual.
    const score = Math.max(0, ahead) + aside * 3;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  if (best) best.focus();
  return Boolean(best);
}
