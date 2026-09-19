import { MouseEvent as ReactMouseEvent, useCallback, useEffect, useRef, useState } from "react";
import { useHlsVideo } from "../hooks/useHlsVideo.js";

interface PlayerProps {
  src: string;
  title: string;
  subtitle?: string;
  onClose: () => void;
  /** Live IPTV streams are HLS (.m3u8) and need hls.js; Plex/Silo direct-play files can be set as the video src as-is. */
  isHls?: boolean;
  /**
   * Known runtime in seconds (e.g. from TMDB), used in place of the video element's own
   * `duration`. Some sources - notably Silo, proxied without Range support and served as a
   * progressive download with no upfront moov atom - report a `duration` that only reflects
   * how much has downloaded so far rather than the real length of the file.
   */
  durationHint?: number;
}

const CONTROLS_HIDE_DELAY = 2800;

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor">
      <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
    </svg>
  );
}

function Replay10Icon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
      <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8zm-1.1 11h-.85v-3.26l-1.01.31v-.69l1.77-.63h.09V16zm4.28-1.76c0 .32-.03.6-.1.82s-.17.4-.29.55-.28.24-.45.31-.37.1-.58.1-.41-.03-.59-.1-.33-.17-.46-.31-.23-.33-.29-.55-.1-.5-.1-.82v-.74c0-.32.03-.6.1-.82s.17-.4.29-.54.28-.24.45-.31.37-.1.59-.1.41.03.59.1.33.17.46.31.23.33.29.54.1.5.1.82v.74zm-.85-.86c0-.19-.01-.35-.04-.48s-.07-.23-.12-.31-.11-.14-.19-.17-.16-.05-.25-.05-.18.02-.25.05-.14.09-.19.17-.09.18-.12.31-.04.29-.04.48v.97c0 .19.01.36.04.48s.07.24.12.32.11.14.19.17.16.05.25.05.18-.02.25-.05.14-.09.19-.17.09-.19.12-.32.04-.29.04-.48v-.97z" />
    </svg>
  );
}

function Forward10Icon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
      <path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8zm-1.1 11h-.85v-3.26l-1.01.31v-.69l1.77-.63h.09V16zm4.28-1.76c0 .32-.03.6-.1.82s-.17.4-.29.55-.28.24-.45.31-.37.1-.58.1-.41-.03-.59-.1-.33-.17-.46-.31-.23-.33-.29-.55-.1-.5-.1-.82v-.74c0-.32.03-.6.1-.82s.17-.4.29-.54.28-.24.45-.31.37-.1.59-.1.41.03.59.1.33.17.46.31.23.33.29.54.1.5.1.82v.74zm-.85-.86c0-.19-.01-.35-.04-.48s-.07-.23-.12-.31-.11-.14-.19-.17-.16-.05-.25-.05-.18.02-.25.05-.14.09-.19.17-.09.18-.12.31-.04.29-.04.48v.97c0 .19.01.36.04.48s.07.24.12.32.11.14.19.17.16.05.25.05.18-.02.25-.05.14-.09.19-.17.09-.19.12-.32.04-.29.04-.48v-.97z" />
    </svg>
  );
}

function VolumeIcon({ muted }: { muted: boolean }) {
  if (muted) {
    return (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
        <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.42.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 003.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
    </svg>
  );
}

function FullscreenIcon({ active }: { active: boolean }) {
  if (active) {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
        <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
      <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
    </svg>
  );
}

const DEFAULT_VOLUME = 0.85;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export default function Player({ src, title, subtitle, onClose, isHls = false, durationHint }: PlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hideTimer = useRef<number | null>(null);
  const { error, playing: loaded } = useHlsVideo(videoRef, src, isHls);

  const [paused, setPaused] = useState(true);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(DEFAULT_VOLUME);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [seeking, setSeeking] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [flashIcon, setFlashIcon] = useState<"play" | "pause" | null>(null);

  // Prefer the known runtime over the video element's own (possibly unreliable) duration.
  const effectiveDuration = durationHint && durationHint > 0 ? durationHint : duration;

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      setShowControls((prevControls) => {
        const video = videoRef.current;
        if (video && !video.paused) return false;
        return prevControls;
      });
    }, CONTROLS_HIDE_DELAY);
  }, []);

  const wakeControls = useCallback(() => {
    setShowControls(true);
    scheduleHide();
  }, [scheduleHide]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.volume = DEFAULT_VOLUME;
      video.muted = false;

      const onPlay = () => {
        setPaused(false);
        scheduleHide();
      };
      const onPause = () => {
        setPaused(true);
        setShowControls(true);
      };
      const onTimeUpdate = () => setCurrentTime(video.currentTime);
      const onDurationChange = () => setDuration(video.duration || 0);
      const onProgress = () => {
        const ranges = video.buffered;
        if (ranges.length > 0) setBufferedEnd(ranges.end(ranges.length - 1));
      };
      const onWaiting = () => setBuffering(true);
      const onCanPlay = () => setBuffering(false);
      const onPlaying = () => setBuffering(false);

      video.addEventListener("play", onPlay);
      video.addEventListener("pause", onPause);
      video.addEventListener("timeupdate", onTimeUpdate);
      video.addEventListener("durationchange", onDurationChange);
      video.addEventListener("progress", onProgress);
      video.addEventListener("waiting", onWaiting);
      video.addEventListener("canplay", onCanPlay);
      video.addEventListener("playing", onPlaying);

      return () => {
        video.removeEventListener("play", onPlay);
        video.removeEventListener("pause", onPause);
        video.removeEventListener("timeupdate", onTimeUpdate);
        video.removeEventListener("durationchange", onDurationChange);
        video.removeEventListener("progress", onProgress);
        video.removeEventListener("waiting", onWaiting);
        video.removeEventListener("canplay", onCanPlay);
        video.removeEventListener("playing", onPlaying);
      };
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  useEffect(() => {
    const onFullscreenChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, []);

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setFlashIcon("play");
    } else {
      video.pause();
      setFlashIcon("pause");
    }
    window.setTimeout(() => setFlashIcon(null), 500);
    wakeControls();
  }

  // Some sources (e.g. Silo, proxied without Range support) can't actually seek past
  // what's already been downloaded - clamping to video.seekable (not just [0, duration])
  // stops the scrubber from jumping ahead and silently snapping back to 0.
  function clampToSeekable(target: number): number {
    const video = videoRef.current;
    if (!video) return target;
    const seekable = video.seekable;
    if (seekable.length === 0) return Math.min(Math.max(target, 0), effectiveDuration || Infinity);
    return Math.min(Math.max(target, seekable.start(0)), seekable.end(seekable.length - 1));
  }

  function seek(deltaSeconds: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = clampToSeekable(video.currentTime + deltaSeconds);
    wakeControls();
  }

  function seekTo(fraction: number) {
    const video = videoRef.current;
    if (!video || !effectiveDuration) return;
    video.currentTime = clampToSeekable(Math.min(Math.max(fraction, 0), 1) * effectiveDuration);
  }

  function toggleMute() {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
    wakeControls();
  }

  function handleVolumeChange(v: number) {
    const video = videoRef.current;
    if (!video) return;
    video.volume = v;
    video.muted = v === 0;
    setVolume(v);
    setMuted(v === 0);
    wakeControls();
  }

  function toggleFullscreen() {
    const container = containerRef.current;
    if (!container) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      container.requestFullscreen();
    }
    wakeControls();
  }

  function handleClose(e?: ReactMouseEvent) {
    e?.stopPropagation();
    if (document.fullscreenElement) document.exitFullscreen();
    onClose();
  }

  function handleScrubStart(e: ReactMouseEvent<HTMLDivElement>) {
    setSeeking(true);
    scrubAt(e);
  }

  function scrubAt(e: ReactMouseEvent<HTMLDivElement> | MouseEvent) {
    const track = document.querySelector(".player-progress-track");
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const fraction = (e.clientX - rect.left) / rect.width;
    seekTo(fraction);
  }

  useEffect(() => {
    if (!seeking) return;
    const onMove = (e: MouseEvent) => scrubAt(e);
    const onUp = () => setSeeking(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seeking, effectiveDuration]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return;
      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
        case "j":
          seek(-10);
          break;
        case "ArrowRight":
        case "l":
          seek(10);
          break;
        case "m":
          toggleMute();
          break;
        case "f":
          toggleFullscreen();
          break;
        case "Escape":
          if (!document.fullscreenElement) handleClose();
          break;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  const progressFraction = effectiveDuration > 0 ? currentTime / effectiveDuration : 0;
  const bufferedFraction = effectiveDuration > 0 ? bufferedEnd / effectiveDuration : 0;

  return (
    <div
      className={`vplayer ${showControls ? "vplayer-controls-visible" : "vplayer-controls-hidden"}`}
      ref={containerRef}
      onMouseMove={wakeControls}
      onClick={(e) => {
        if (e.target === e.currentTarget) togglePlay();
      }}
    >
      <video
        ref={videoRef}
        className="vplayer-video"
        playsInline
        onClick={togglePlay}
      />

      {flashIcon && (
        <div className="vplayer-flash">
          {flashIcon === "play" ? <PlayIcon /> : <PauseIcon />}
        </div>
      )}

      {!error && (buffering || !loaded) && (
        <div className="vplayer-spinner-wrap">
          <div className="vplayer-spinner" />
        </div>
      )}

      {error && (
        <div className="vplayer-error">
          <div className="vplayer-error-title">Playback failed</div>
          <div className="vplayer-error-message">{error}</div>
          <button className="vplayer-error-close" onClick={() => handleClose()}>
            Close
          </button>
        </div>
      )}

      <div className="vplayer-top-bar">
        <div className="vplayer-top-left">
          <button className="vplayer-icon-btn" onClick={handleClose} aria-label="Back">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M15 18l-6-6 6-6"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <div className="vplayer-top-text">
            <div className="vplayer-top-title">{title}</div>
            {subtitle && <div className="vplayer-top-subtitle">{subtitle}</div>}
          </div>
        </div>
        <button className="vplayer-icon-btn" onClick={handleClose} aria-label="Exit player">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {!error && (
        <div className="vplayer-bottom-bar" onClick={(e) => e.stopPropagation()}>
          <div
            className="player-progress-track"
            onMouseDown={handleScrubStart}
          >
            <div className="player-progress-buffered" style={{ width: `${bufferedFraction * 100}%` }} />
            <div className="player-progress-fill" style={{ width: `${progressFraction * 100}%` }} />
            <div className="player-progress-knob" style={{ left: `${progressFraction * 100}%` }} />
          </div>

          <div className="vplayer-controls-row">
            <div className="vplayer-controls-left">
              <button className="transport-btn transport-btn-primary" onClick={togglePlay}>
                {paused ? <PlayIcon /> : <PauseIcon />}
              </button>
              <button className="transport-btn" onClick={() => seek(-10)} title="Back 10 seconds">
                <Replay10Icon />
              </button>
              <button className="transport-btn" onClick={() => seek(10)} title="Forward 10 seconds">
                <Forward10Icon />
              </button>
              <div className="vplayer-time">
                {formatTime(currentTime)} <span className="vplayer-time-sep">/</span> {formatTime(effectiveDuration)}
              </div>
            </div>

            <div className="vplayer-controls-right">
              <div className="vplayer-volume-group">
                <button className="transport-btn" onClick={toggleMute}>
                  <VolumeIcon muted={muted || volume === 0} />
                </button>
                <input
                  type="range"
                  className="live-volume vplayer-volume-slider"
                  min={0}
                  max={1}
                  step={0.05}
                  value={muted ? 0 : volume}
                  onChange={(e) => handleVolumeChange(Number(e.target.value))}
                />
              </div>
              <button className="transport-btn" onClick={toggleFullscreen} title="Fullscreen">
                <FullscreenIcon active={fullscreen} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
