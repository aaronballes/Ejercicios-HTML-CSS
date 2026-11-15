# Reproductor IPTV

Web para ver los canales de una fuente IPTV (lista M3U o Xtream Codes) desde el navegador,
con cuentas de usuario. El planteamiento y las fases están en `README.md`.

## Estructura

- `apps/server` — Node + Fastify + TypeScript.
  - `source.ts` carga y cachea la lista · `proxy.ts` proxy de vídeo y reescritura de HLS
  - `users.ts` cuentas y sesiones · `index.ts` rutas de la API · `config.ts` variables de entorno
- `apps/web` — React + Vite + TypeScript. `App.tsx` pantalla principal, `Player.tsx` vídeo,
  `Users.tsx` gestión de usuarios, `api.ts` llamadas al servidor.
- `pruebas/` — proveedor IPTV falso y prueba de navegador.

## Comandos

- `npm run dev` — desarrollo (interfaz en 5173, servidor en 3000).
- `npm run build` — compila todo (incluye comprobación de tipos).
- `npm test` — compila, arranca el proveedor falso y pasa la prueba de navegador.
  Necesita `ffmpeg` y Playwright con Chromium.

## Reglas del proyecto

1. **Las credenciales del proveedor no salen del servidor.** Ni en el repositorio, ni en
   respuestas de la API, ni en URLs que vea el navegador (para eso `proxy.ts` las cifra).
   Solo viven en `.env`.
2. **Nunca se prueba contra un proveedor real.** Se usa `pruebas/proveedor-falso.mjs`.
3. **Toda ruta `/api/*` exige sesión** salvo `/api/login` y `/api/session`; las de
   `/api/users` exigen además ser administrador. Una ruta nueva hereda esto del `onRequest`
   de `index.ts`: no lo esquives.
4. **Un cambio no está hecho hasta que `npm test` pasa.** Si añades una función visible,
   añade su comprobación en `pruebas/e2e.cjs`.
5. Interfaz, mensajes de error, comentarios y commits en **español**. Los mensajes que ve el
   usuario dicen qué ha pasado y qué puede hacer, sin jerga técnica.
6. Sin dependencias nuevas si se resuelve en pocas líneas con lo que ya hay.

## Equipo (`.claude/agents/`)

| Agente | Para qué |
|---|---|
| `arquitecto` | Diseñar una función antes de escribirla: qué archivos toca, qué riesgos tiene. No edita. |
| `backend` | API, cuentas, carga de listas, datos, Docker. |
| `frontend` | Interfaz React, estilos, accesibilidad, móvil y tele, PWA. |
| `video` | Reproducción y streaming: HLS, MPEG-TS, proxy, códecs, ffmpeg, guía de programación. |
| `seguridad` | Revisar un cambio antes de darlo por bueno. No edita. |
| `probador` | Pasar las pruebas, ampliar `pruebas/e2e.cjs` y reproducir fallos. |

Flujo habitual para una función nueva: `arquitecto` → `backend` / `frontend` / `video` →
`seguridad` y `probador`. Para un arreglo pequeño basta con el especialista y el `probador`.
