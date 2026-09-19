import { RefObject, useEffect, useState } from "react";
import Hls from "hls.js";

export function useHlsVideo(
  videoRef: RefObject<HTMLVideoElement | null>,
  src: string | undefined,
  isHls: boolean,
) {
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    setError(null);
    setPlaying(false);

    let hls: Hls | null = null;
    let recoveryAttempted = false;

    const onPlaying = () => setPlaying(true);
    const onVideoError = () => {
      const mediaError = video.error;
      setError(mediaError ? `Playback error (code ${mediaError.code})` : "Playback error");
    };

    video.addEventListener("playing", onPlaying);
    video.addEventListener("error", onVideoError);

    if (isHls && Hls.isSupported()) {
      hls = new Hls();
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            if (!recoveryAttempted) {
              recoveryAttempted = true;
              hls?.startLoad();
            } else {
              setError(
                `Stream failed to load (${data.details}). The provider may be unreachable or blocking this connection.`,
              );
            }
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            if (!recoveryAttempted) {
              recoveryAttempted = true;
              hls?.recoverMediaError();
            } else {
              setError(`Playback error (${data.details})`);
            }
            break;
          default:
            setError(`Stream failed to load (${data.details})`);
        }
      });
      hls.loadSource(src);
      hls.attachMedia(video);
    } else {
      video.src = src;
    }

    video.play().catch(() => {
      // autoplay might be blocked; user can press play manually
    });

    return () => {
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("error", onVideoError);
      hls?.destroy();
    };
  }, [videoRef, src, isHls]);

  return { error, playing };
}
