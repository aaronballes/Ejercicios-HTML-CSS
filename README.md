# Reproductor IPTV (nombre provisional)

Aplicación web para ver los canales de una suscripción IPTV propia desde el navegador
(ordenador, móvil y tele), instalable como app (PWA).

> Estado: **planteamiento**. Todavía no hay código; este documento es la propuesta a validar.

## 1. Qué hará

- Cargar los canales de la IPTV (lista **M3U** o cuenta **Xtream Codes**).
- Listado por categorías, buscador y favoritos.
- Reproductor con cambio rápido de canal, pantalla completa y "seguir viendo".
- Guía de programación (EPG, formato XMLTV) si el proveedor la ofrece.
- Películas y series (VOD) si la cuenta las incluye — fase posterior.
- Acceso protegido con contraseña: las credenciales de la IPTV nunca llegan al navegador.

## 2. Arquitectura

```
Navegador (React PWA)  ──►  Servidor propio (Node)  ──►  Proveedor IPTV
   lista, EPG, vídeo         API + proxy de vídeo         M3U / Xtream / XMLTV
```

Hace falta un servidor intermedio, no basta con una web estática, por tres motivos:

1. **CORS y contenido mixto**: casi todos los proveedores sirven por `http://` y sin cabeceras
   CORS, así que un navegador en una página `https://` no puede reproducirlos directamente.
2. **Credenciales**: usuario y contraseña van dentro de las URLs de los canales; el servidor
   las guarda y el navegador solo ve identificadores internos.
3. **Tamaño**: las listas suelen tener miles de entradas y el EPG decenas de MB; el servidor
   los descarga, procesa y cachea una vez, y entrega al navegador solo lo que pide.

### Tecnologías

| Pieza | Elección | Motivo |
|---|---|---|
| Frontend | React + Vite + TypeScript | Rápido de desarrollar, buen soporte PWA |
| Vídeo | `hls.js` (HLS) y `mpegts.js` (MPEG-TS) | Cubren los dos formatos habituales en IPTV |
| Backend | Node + Fastify + TypeScript | Mismo lenguaje en todo el proyecto, buen streaming |
| Datos | SQLite | Canales, EPG y favoritos sin montar una base de datos aparte |
| Conversión (opcional) | `ffmpeg` | Solo si algún canal usa un códec que el navegador no admite |
| Despliegue | Docker Compose | Un solo comando en un mini PC, Raspberry Pi, NAS o VPS |

El vídeo pasa por el servidor, así que **no sirve un hosting gratuito tipo Vercel/Netlify**:
tiene que ser una máquina propia o un VPS con ancho de banda suficiente.

## 3. Estructura prevista

```
/
├── apps/
│   ├── server/     API, proxy de vídeo, importación de lista y EPG
│   └── web/        Interfaz React (PWA)
├── docker-compose.yml
├── .env.example    Plantilla de configuración (sin datos reales)
└── README.md
```

## 4. Fases

| Fase | Entregable | Se da por buena cuando… |
|---|---|---|
| 0 | Esqueleto del proyecto, Docker, configuración por `.env` | `docker compose up` abre una página vacía con login |
| 1 | Importar la lista y mostrar canales por categoría con buscador | Se ven todos los canales de la cuenta con su logo |
| 2 | Reproductor (HLS + MPEG-TS) a través del proxy | Se reproduce un canal en Chrome, Safari de iPhone y Android |
| 3 | Favoritos, último canal visto, cambio rápido | Se puede usar a diario sin pasar por la lista completa |
| 4 | Guía de programación (EPG) | Cada canal muestra "ahora" y "después" |
| 5 | PWA instalable, mando/teclado para tele | Se instala en el móvil y se maneja con las flechas |
| 6 | Películas y series (VOD), si la cuenta las tiene | Catálogo con carátulas y reanudación |

Las fases 0–2 son el producto mínimo; a partir de ahí cada una es independiente.

## 5. Riesgos conocidos

- **Límite de conexiones**: muchas cuentas permiten 1 sola reproducción simultánea. La app
  cerrará la conexión anterior antes de abrir otra.
- **Códecs**: canales en HEVC/H.265 o audio AC3 no se reproducen en todos los navegadores;
  para esos habría que convertir con `ffmpeg`, lo que consume CPU.
- **Bloqueos del proveedor**: algunos restringen por IP o por tipo de cliente; puede hacer falta
  que el servidor esté en la misma red de casa.
- **Seguridad**: las credenciales viven solo en `.env` (ignorado por git). No se suben al
  repositorio ni se escriben en el código.

## 6. Datos que necesito para empezar

1. **Formato de la IPTV**: ¿URL de lista M3U, o servidor + usuario + contraseña (Xtream Codes)?
2. **Dónde la vas a ver**: ordenador, móvil, Smart TV / Android TV…
3. **Dónde se alojará**: ¿tienes un equipo siempre encendido en casa (mini PC, Raspberry, NAS) o
   prefieres un VPS?
4. **Alcance**: ¿solo canales en directo, o también películas y series?
5. **Usuarios**: ¿solo tú o más personas?

## 7. Uso previsto

Pensado para una suscripción IPTV de la que seas titular. El proyecto es solo un reproductor:
no incluye ni distribuye listas ni contenidos.
