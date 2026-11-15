import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import mpegts from 'mpegts.js';
import type { Channel } from './api';

export function Player({ channel, tv }: { channel: Channel | null; tv: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  // El navegador puede negarse a reproducir con sonido hasta que se pulse algo.
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video || !channel) return;
    setError('');
    setBlocked(false);
    const src = `/api/stream/${channel.id}`;
    const fail = () => setError('No se puede reproducir este canal ahora mismo.');
    const play = () => {
      const p = video.play() as Promise<void> | undefined;
      if (p && p.catch) p.catch((e: Error) => e.name === 'NotAllowedError' && setBlocked(true));
    };
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

  useEffect(() => {
    if (!blocked) return;
    const resume = () => {
      setBlocked(false);
      const p = ref.current?.play() as Promise<void> | undefined;
      if (p && p.catch) p.catch(() => {});
    };
    document.addEventListener('keydown', resume, true);
    document.addEventListener('click', resume, true);
    return () => {
      document.removeEventListener('keydown', resume, true);
      document.removeEventListener('click', resume, true);
    };
  }, [blocked]);

  return (
    <div className="player">
      {/* En la tele no hay controles del navegador: el mando lo gestiona la app. */}
      <video ref={ref} controls={!tv} playsInline tabIndex={-1} />
      {!channel && <p className="player-msg">Elige un canal para empezar</p>}
      {channel && blocked && !error && (
        <p className="player-msg">{tv ? 'Pulsa OK para reproducir' : 'Pulsa para reproducir'}</p>
      )}
      {error && <p className="player-msg error">{error}</p>}
    </div>
  );
}
