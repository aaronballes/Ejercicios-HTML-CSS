import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import mpegts from 'mpegts.js';
import type { Channel } from './api';

export function Player({ channel }: { channel: Channel | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const video = ref.current;
    if (!video || !channel) return;
    setError('');
    const src = `/api/stream/${channel.id}`;
    const fail = () => setError('No se puede reproducir este canal ahora mismo.');
    const play = () => void video.play().catch(() => {});
    let cleanup = () => {};

    if (channel.kind === 'hls' && Hls.isSupported()) {
      const hls = new Hls({ liveSyncDurationCount: 3 });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        else fail();
      });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, play);
      cleanup = () => hls.destroy();
    } else if (channel.kind === 'hls') {
      // Safari reproduce HLS de forma nativa.
      video.src = src;
      video.addEventListener('error', fail);
      play();
      cleanup = () => video.removeEventListener('error', fail);
    } else if (mpegts.isSupported()) {
      const p = mpegts.createPlayer({ type: 'mpegts', isLive: true, url: src });
      p.on(mpegts.Events.ERROR, fail);
      p.attachMediaElement(video);
      p.load();
      play();
      cleanup = () => p.destroy();
    } else {
      setError('Este navegador no admite el formato de este canal.');
    }

    return () => {
      cleanup();
      video.removeAttribute('src');
      video.load();
    };
  }, [channel]);

  return (
    <div className="player">
      <video ref={ref} controls playsInline />
      {!channel && <p className="player-msg">Elige un canal para empezar</p>}
      {error && <p className="player-msg error">{error}</p>}
    </div>
  );
}
