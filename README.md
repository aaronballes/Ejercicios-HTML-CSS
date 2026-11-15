# Reproductor IPTV (nombre provisional)

Aplicación web para ver los canales de una suscripción IPTV propia desde el navegador
(ordenador, móvil y tele), instalable como app (PWA).

> Estado: **fases 0–2 hechas** (lista de canales, buscador, favoritos, reproductor y cuentas de usuario).
> Incluye modo tele para manejarla con el mando.
> Pendiente: guía de programación, PWA instalable y películas/series.

## Puesta en marcha

La aplicación tiene que estar funcionando en un ordenador de tu casa. La tele, el móvil y los
demás aparatos se conectan a ese ordenador por la wifi.

### La forma fácil

1. Descarga el código (botón verde **Code → Download ZIP** en GitHub) y descomprímelo.
2. Ejecuta el instalador:
   - **Windows:** doble clic en `iniciar.bat`.
   - **Mac:** doble clic en `iniciar.command` (la primera vez: clic derecho → Abrir).
   - **Linux:** `./iniciar.sh` en una terminal.
3. La primera vez te pregunta la contraseña de administrador y los datos de tu IPTV, descarga
   lo necesario y arranca. Las siguientes veces arranca directamente.
4. Al terminar muestra la dirección que hay que abrir en la tele o el móvil, del tipo
   `http://192.168.1.40:3000`. Entra con el usuario `admin`.
5. Con el botón **Usuarios** crea una cuenta para cada persona.

Mientras esa ventana esté abierta, la aplicación funciona; al cerrarla o apagar el ordenador,
se para. Si falta Node.js (el programa que la hace funcionar), el instalador de Windows intenta
instalarlo; en Mac y Linux se descarga de <https://nodejs.org> (versión 22 o superior).

Para cambiar la configuración edita el archivo `.env`; para empezar de cero, bórralo y vuelve
a ejecutar el instalador.

### A mano o con Docker

Copia `.env.example` a `.env`, rellénalo y usa una de estas opciones:

```bash
# Con Docker
docker compose up -d --build

# Sin Docker (Node 22.9 o superior)
npm install
npm run build
npm start
```

Para desarrollar: `npm run dev` (interfaz en el puerto 5173, servidor en el 3000).
Para probar: `npm test` (usa un proveedor falso local; necesita `ffmpeg` y Playwright).

### Usuarios

- El administrador se define en `.env`; solo él crea usuarios, les cambia la contraseña o los elimina.
- Las contraseñas se guardan con hash (scrypt) en `data/users.json`, fuera del repositorio.
- Al eliminar a alguien o cambiarle la contraseña, sus sesiones abiertas se cierran.
- Tras 5 intentos fallidos desde una misma IP, el acceso se bloquea 10 minutos.
- Favoritos y último canal son propios de cada usuario (se guardan en su navegador).
- Si la app va a ser accesible desde fuera de casa, ponla detrás de HTTPS (por ejemplo con
  Caddy o un túnel): sin él las contraseñas viajan en claro.

### En una Smart TV

1. Abre el navegador de la tele y entra en `http://<ip-del-equipo>:3000` (la tele y el
   servidor tienen que estar en la misma red, o el servidor ser accesible desde fuera).
2. Inicia sesión una vez con el teclado en pantalla; la sesión dura 30 días.
3. La app detecta la tele y activa sola el **modo tele**. Si no lo hace, pulsa el botón
   «Modo tele» de arriba (también sirve para probarlo en un ordenador).

| Mando | En la lista | Viendo un canal |
|---|---|---|
| ▲ ▼ | Moverse | Canal anterior / siguiente |
| OK | Ver el canal a pantalla completa | Volver a la lista |
| ▶ | Ir a la estrella de favorito | Volver a la lista |
| ◀ | Pantalla completa | Volver a la lista |
| Canal + / − | Cambiar de canal | Cambiar de canal |
| Atrás | Pantalla completa | Volver a la lista |

Funciona con el navegador de teles Samsung (Tizen), LG (webOS), Android TV / Google TV y
Fire TV. Se genera una versión del código para navegadores antiguos (Chrome 53 en adelante,
aproximadamente teles de 2018 o posteriores). En algunas teles el botón «Atrás» lo captura el
propio navegador y sale de la página: en ese caso usa OK o las flechas.

Todavía no es una app instalable desde la tienda de la tele; se usa desde su navegador.

## 1. Qué hará

- Cargar los canales de la IPTV (lista **M3U** o cuenta **Xtream Codes**).
- Listado por categorías, buscador y favoritos.
- Reproductor con cambio rápido de canal, pantalla completa y "seguir viendo".
- Guía de programación (EPG, formato XMLTV) si el proveedor la ofrece.
- Películas y series (VOD) si la cuenta las incluye — fase posterior.
- Acceso con usuario y contraseña para cada persona; las credenciales de la IPTV nunca llegan al navegador.

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
| Datos | Memoria + `localStorage` (SQLite cuando llegue el EPG) | La lista se cachea en el servidor; favoritos y último canal, en el navegador |
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
├── pruebas/        Proveedor falso y prueba de navegador
├── .claude/agents/ Equipo de agentes del proyecto (ver CLAUDE.md)
├── iniciar.*       Instalador y arranque en un paso (.bat, .command, .sh)
├── docker-compose.yml
├── .env.example    Plantilla de configuración (sin datos reales)
└── README.md
```

## 4. Fases

| Fase | Entregable | Se da por buena cuando… |
|---|---|---|
| 0 ✅ | Esqueleto del proyecto, Docker, configuración por `.env` | `docker compose up` abre una página vacía con login |
| 1 ✅ | Importar la lista y mostrar canales por categoría con buscador | Se ven todos los canales de la cuenta con su logo |
| 2 ✅ | Reproductor (HLS + MPEG-TS) a través del proxy | Se reproduce un canal en Chrome, Safari de iPhone y Android |
| 3 (parcial) | Favoritos ✅, último canal visto ✅, cambio rápido | Se puede usar a diario sin pasar por la lista completa |
| 4 | Guía de programación (EPG) | Cada canal muestra "ahora" y "después" |
| 5 (parcial) | Mando/teclado para tele ✅, PWA instalable | Se instala en el móvil y se maneja con las flechas |
| 6 | Películas y series (VOD), si la cuenta las tiene | Catálogo con carátulas y reanudación |

Las fases 0–2 son el producto mínimo; a partir de ahí cada una es independiente.

## 5. Riesgos conocidos

- **Límite de conexiones**: muchas cuentas permiten 1 sola reproducción simultánea. Con varios
  usuarios viendo a la vez canales distintos, el proveedor puede cortar a alguno. La app todavía
  no reparte ni avisa de esto.
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
