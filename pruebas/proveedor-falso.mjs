// Proveedor IPTV de mentira para probar sin tocar ningún servicio real.
// Sirve una lista M3U, la API de Xtream Codes (usuario "u", contraseña "p") y vídeo de prueba.
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const port = Number(process.env.FAKE_PORT || 4010);
const base = `http://127.0.0.1:${port}`;
const root = join(tmpdir(), 'iptv-proveedor-falso');
const live = join(root, 'live', 'u', 'p');

if (!existsSync(join(root, 'raw.ts'))) {
  mkdirSync(live, { recursive: true });
  const src = ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=25', '-f', 'lavfi', '-i', 'sine=frequency=440'];
  const enc = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '50', '-c:a', 'aac'];
  execFileSync('ffmpeg', [...src, '-t', '12', ...enc, '-hls_time', '2', '-hls_list_size', '0',
    '-hls_segment_filename', join(live, 'seg%d.ts'), join(live, '101.m3u8')]);
  execFileSync('ffmpeg', [...src, '-t', '8', ...enc, '-f', 'mpegts', join(root, 'raw.ts')]);
}

http.createServer((req, res) => {
  const u = new URL(req.url, base);
  if (u.pathname === '/player_api.php') {
    res.setHeader('content-type', 'application/json');
    if (u.searchParams.get('username') !== 'u' || u.searchParams.get('password') !== 'p') {
      return res.end(JSON.stringify({ user_info: { auth: 0 } }));
    }
    const action = u.searchParams.get('action');
    if (action === 'get_live_categories') {
      return res.end(JSON.stringify([
        { category_id: '1', category_name: 'Deportes' },
        { category_id: '2', category_name: 'Noticias' },
      ]));
    }
    if (action === 'get_live_streams') {
      return res.end(JSON.stringify([
        { stream_id: 101, name: 'Canal Uno HD', stream_icon: '', category_id: '1' },
        { stream_id: 101, name: 'Canal Dos', stream_icon: '', category_id: '2' },
        { stream_id: 999, name: 'Canal Roto', stream_icon: '', category_id: '2' },
      ]));
    }
  }
  if (u.pathname === '/list.m3u') {
    return res.end(`#EXTM3U
#EXTINF:-1 tvg-id="a" tvg-logo="" group-title="Deportes",Canal HLS
${base}/live/u/p/101.m3u8
#EXTINF:-1 tvg-id="b" group-title="Noticias, hoy",Canal TS
${base}/raw.ts
`);
  }
  const file = join(root, u.pathname);
  if (file.startsWith(root) && existsSync(file) && statSync(file).isFile()) {
    res.setHeader('content-type', file.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t');
    return createReadStream(file).pipe(res);
  }
  res.statusCode = 404;
  res.end('no existe');
}).listen(port, () => console.log(`Proveedor falso en ${base}`));
