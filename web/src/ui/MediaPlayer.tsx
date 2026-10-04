import { MouseEvent as ReactMouseEvent, useCallback, useEffect, useRef, useState } from "react";
import { useHlsVideo } from "../hooks/useHlsVideo.js";
import { qualityFromResolution } from "../utils/quality.js";
import Icon from "./Icon.js";
import "./mediaplayer.css";

interface MediaPlayerProps {
  src?: string;
  /** HLS (.m3u8) streams, i.e. live TV, need hls.js. Direct files do not. */
  isHls?: boolean;
  title?: string;
  subtitle?: string;
  live?: boolean;
  /** Known runtime in seconds; some sources report a duration that only reflects what has downloaded so far. */
  durationHint?: number;
  /** Shown when nothing is playing yet. */
  emptyMessage?: string;
  theater?: boolean;
  onToggleTheater?: () => void;
  onClose?: () => void;
  /** Called with the real decoded resolution label (e.g. "1080p") once the first frame is known. */
  onQuality?: (quality: string) => void;
  /** Fill whatever box it is placed in instead of sizing itself (used by the app-level player host). */
  fill?: boolean;
  /** Small floating version: minimal controls, no keyboard shortcuts. */
  compact?: boolean;
  /** Compact only: bring the player back to its full-size home. */
  onExpand?: () => void;
}

const HIDE_DELAY = 2800;
const LIVE_VOLUME = 0.25;
const VOD_VOLUME = 0.85;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** One player for live channels and movies: auto-hiding controls, scrubber, theater and fullscreen. */
export default function MediaPlayer({
  src,
  isHls = false,
  title,
  subtitle,
  live = false,
  durationHint,
  emptyMessage = "Pick something to watch",
  theater,
  onToggleTheater,
  onClose,
  onQuality,
  fill,
  compact,
  onExpand,
}: MediaPlayerProps) {
  const onQualityRef = useRef(onQuality);
  onQualityRef.current = onQuality;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const hideTimer = useRef<number | null>(null);
  const baseVolume = live ? LIVE_VOLUME : VOD_VOLUME;
  const { error, playing: started } = useHlsVideo(videoRef, src, isHls);

  const [paused, setPaused] = useState(true);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(baseVolume);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [buffering, setBuffering] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const [showUi, setShowUi] = useState(true);
  const [isFull, setIsFull] = useState(false);
  const [quality, setQuality] = useState<string | null>(null);

  const total = durationHint && durationHint > 0 ? durationHint : duration;

  const armHide = useCallback(() => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      const v = videoRef.current;
      if (v && !v.paused) setShowUi(false);
    }, HIDE_DELAY);
  }, []);

  const wake = useCallback(() => {
    setShowUi(true);
    armHide();
  }, [armHide]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = false;
    v.volume = baseVolume;
    setMuted(false);
    setVolume(baseVolume);
    setQuality(null);
    setTime(0);
    setDuration(0);
    setBuffered(0);

    const on = {
      play: () => {
        setPaused(false);
        armHide();
      },
      pause: () => {
        setPaused(true);
        setShowUi(true);
      },
      timeupdate: () => setTime(v.currentTime),
      durationchange: () => setDuration(Number.isFinite(v.duration) ? v.duration : 0),
      progress: () => {
        const r = v.buffered;
        if (r.length > 0) setBuffered(r.end(r.length - 1));
      },
      waiting: () => setBuffering(true),
      playing: () => setBuffering(false),
      canplay: () => setBuffering(false),
      resize: () => {
        if (v.videoWidth && v.videoHeight) {
          const q = qualityFromResolution(v.videoWidth, v.videoHeight);
          setQuality(q);
          onQualityRef.current?.(q);
        }
      },
    };
    for (const [name, fn] of Object.entries(on)) v.addEventListener(name, fn);
    return () => {
      for (const [name, fn] of Object.entries(on)) v.removeEventListener(name, fn);
    };
  }, [src, baseVolume, armHide]);

  useEffect(() => {
    const onFs = () => setIsFull(document.fullscreenElement === boxRef.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, []);

  function togglePlay() {
    const v = videoRef.current;
    if (!v || !src) return;
    if (v.paused) void v.play();
    else v.pause();
    wake();
  }

  // Some sources can only seek inside what has already downloaded; clamp so the scrubber never snaps back to 0.
  function clamp(target: number): number {
    const v = videoRef.current;
    if (!v) return target;
    const s = v.seekable;
    if (s.length === 0) return Math.min(Math.max(target, 0), total || Infinity);
    return Math.min(Math.max(target, s.start(0)), s.end(s.length - 1));
  }

  function skip(delta: number) {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = clamp(v.currentTime + delta);
    wake();
  }

  function seekFraction(f: number) {
    const v = videoRef.current;
    if (!v || !total) return;
    v.currentTime = clamp(Math.min(Math.max(f, 0), 1) * total);
  }

  function toggleMute() {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
    wake();
  }

  function changeVolume(next: number) {
    const v = videoRef.current;
    if (!v) return;
    v.volume = next;
    v.muted = next === 0;
    setVolume(next);
    setMuted(next === 0);
    wake();
  }

  function toggleFullscreen() {
    const box = boxRef.current;
    if (!box) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void box.requestFullscreen();
    wake();
  }

  function scrub(e: ReactMouseEvent | MouseEvent) {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    seekFraction((e.clientX - rect.left) / rect.width);
  }

  useEffect(() => {
    if (!scrubbing) return;
    const move = (e: MouseEvent) => scrub(e);
    const up = () => setScrubbing(false);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrubbing, total]);

  useEffect(() => {
    if (!src || compact) return;
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.isContentEditable)) return;
      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
        case "j":
          if (!live) skip(-10);
          break;
        case "ArrowRight":
        case "l":
          if (!live) skip(10);
          break;
        case "m":
          toggleMute();
          break;
        case "f":
          toggleFullscreen();
          break;
        case "t":
          onToggleTheater?.();
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const played = total > 0 ? Math.min(time / total, 1) : 0;
  const loaded = total > 0 ? Math.min(buffered / total, 1) : 0;
  const busy = !!src && !error && (buffering || !started);

  return (
    <div
      className={`mp ${theater && !fill ? "mp--theater" : ""} ${fill ? "mp--fill" : ""} ${compact ? "mp--compact" : ""} ${showUi || !src ? "" : "mp--idle"}`}
      ref={boxRef}
      onMouseMove={wake}
      onMouseLeave={armHide}
    >
      {src ? (
        <video ref={videoRef} className="mp__video" playsInline onClick={togglePlay} />
      ) : (
        <div className="mp__empty">{emptyMessage}</div>
      )}

      {busy && <div className="mp__spinner" aria-label="Loading" />}

      {error && (
        <div className="mp__error">
          <p className="h3">Playback failed</p>
          <p className="muted">{error}</p>
        </div>
      )}

      {src && paused && !busy && !error && (
        <button type="button" className="mp__bigplay" onClick={togglePlay} aria-label="Play">
          <Icon name="play" size={32} />
        </button>
      )}

      {src && (
        <>
          <div className="mp__top">
            {onClose && !compact && (
              <button type="button" className="icon-btn" onClick={onClose} aria-label="Close player">
                <Icon name="back" />
              </button>
            )}
            <div className="mp__titles">
              <div className="mp__title">{title}</div>
              <div className="mp__sub">
                {live && <span className="tag tag--live">LIVE</span>}
                {quality && <span className={`tag ${quality === "4K" ? "tag--accent" : "tag--glass"}`}>{quality}</span>}
                {subtitle && <span>{subtitle}</span>}
              </div>
            </div>
            {compact && (
              <div className="mp__miniactions">
                {onExpand && (
                  <button type="button" className="icon-btn" onClick={onExpand} aria-label="Back to full player" title="Back to full player">
                    <Icon name="fullscreen" size={20} />
                  </button>
                )}
                {onClose && (
                  <button type="button" className="icon-btn" onClick={onClose} aria-label="Stop and close" title="Stop and close">
                    <Icon name="x" size={20} />
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="mp__bottom">
            {!live && (
              <div className="mp__track" ref={trackRef} onMouseDown={(e) => { setScrubbing(true); scrub(e); }}>
                <div className="mp__buffered" style={{ width: `${loaded * 100}%` }} />
                <div className="mp__played" style={{ width: `${played * 100}%` }} />
                <div className="mp__knob" style={{ left: `${played * 100}%` }} />
              </div>
            )}
            <div className="mp__controls">
              <button type="button" className="icon-btn mp__play" onClick={togglePlay} aria-label={paused ? "Play" : "Pause"}>
                <Icon name={paused ? "play" : "pause"} size={22} />
              </button>
              {!live && (
                <>
                  <button type="button" className="icon-btn" onClick={() => skip(-10)} aria-label="Back 10 seconds">
                    <Icon name="replay10" />
                  </button>
                  <button type="button" className="icon-btn" onClick={() => skip(10)} aria-label="Forward 10 seconds">
                    <Icon name="forward10" />
                  </button>
                  <span className="mp__time nums">
                    {formatTime(time)} / {formatTime(total)}
                  </span>
                </>
              )}
              <span className="mp__spacer" />
              <button type="button" className="icon-btn" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"}>
                <Icon name={muted || volume === 0 ? "mute" : "volume"} />
              </button>
              <input
                type="range"
                className="mp__volume"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onChange={(e) => changeVolume(Number(e.target.value))}
                aria-label="Volume"
              />
              {onToggleTheater && (
                <button
                  type="button"
                  className="icon-btn"
                  onClick={onToggleTheater}
                  aria-pressed={!!theater}
                  aria-label="Theater mode"
                  title="Theater mode (T)"
                >
                  <Icon name={theater ? "theaterOn" : "theater"} />
                </button>
              )}
              <button type="button" className="icon-btn" onClick={toggleFullscreen} aria-label="Fullscreen" title="Fullscreen (F)">
                <Icon name={isFull ? "exitFullscreen" : "fullscreen"} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
