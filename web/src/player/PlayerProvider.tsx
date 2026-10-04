import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Channel, streamUrlFor } from "../api.js";
import MediaPlayer from "../ui/MediaPlayer.js";
import "./player.css";

// One live-TV player for the whole app. It is rendered here, above the routes, so changing page never
// unmounts it and the stream keeps playing. On Live TV it is docked onto a placeholder in the page
// layout; everywhere else it shrinks to a floating mini player.

interface PlayerContextValue {
  channel: Channel | null;
  resolution: string | null;
  theater: boolean;
  toggleTheater: () => void;
  play: (channel: Channel) => void;
  stop: () => void;
  /** Live TV hands over the element the player should sit on. */
  slotRef: (el: HTMLElement | null) => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used inside PlayerProvider");
  return ctx;
}

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
  radius: string;
}

function sameBox(a: Box | null, b: Box | null): boolean {
  if (!a || !b) return a === b;
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height && a.radius === b.radius;
}

type HostValue = PlayerContextValue & { setResolution: (q: string) => void };

function PlayerHost({ slot, value }: { slot: HTMLElement | null; value: HostValue }) {
  const navigate = useNavigate();
  const regionRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box | null>(null);
  const { channel, theater, toggleTheater, stop } = value;
  const docked = !!slot;

  // While docked, keep the player on the placeholder: update on scroll, resize and every frame.
  useEffect(() => {
    if (!slot || !channel) {
      setBox(null);
      return;
    }
    const measure = () => {
      const region = regionRef.current;
      if (!region) return;
      const r = slot.getBoundingClientRect();
      const o = region.getBoundingClientRect();
      const next: Box = {
        left: Math.round(r.left - o.left),
        top: Math.round(r.top - o.top),
        width: Math.round(r.width),
        height: Math.round(r.height),
        radius: getComputedStyle(slot).borderRadius,
      };
      setBox((prev) => (sameBox(prev, next) ? prev : next));
    };
    let frame = 0;
    const loop = () => {
      measure();
      frame = requestAnimationFrame(loop);
    };
    loop();
    // Scroll events from any scroller (the page stage scrolls, not the window) and layout changes.
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    const observer = new ResizeObserver(measure);
    observer.observe(slot);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
      observer.disconnect();
    };
  }, [slot, channel]);

  if (!channel) return null;

  const style = docked
    ? box
      ? { left: box.left, top: box.top, width: box.width, height: box.height, borderRadius: box.radius }
      : { visibility: "hidden" as const }
    : undefined;

  return (
    <div className="phost" ref={regionRef}>
      <div className={`phost__box ${docked ? "is-docked" : "is-mini"}`} style={style}>
        <MediaPlayer
          src={streamUrlFor("live", channel.id)}
          isHls
          live
          fill
          compact={!docked}
          title={channel.name}
          subtitle={channel.category}
          theater={theater}
          onToggleTheater={docked ? toggleTheater : undefined}
          onClose={stop}
          onExpand={() => navigate("/live")}
          onQuality={value.setResolution}
        />
      </div>
    </div>
  );
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [channel, setChannel] = useState<Channel | null>(null);
  const [resolution, setResolution] = useState<string | null>(null);
  const [theater, setTheater] = useState(false);
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  const play = useCallback((c: Channel) => {
    setChannel((prev) => {
      if (prev?.id !== c.id) setResolution(null);
      return c;
    });
  }, []);
  const stop = useCallback(() => {
    setChannel(null);
    setResolution(null);
  }, []);
  const toggleTheater = useCallback(() => setTheater((t) => !t), []);
  const slotRef = useCallback((el: HTMLElement | null) => setSlot(el), []);

  const value: HostValue = useMemo(
    () => ({ channel, resolution, theater, toggleTheater, play, stop, slotRef, setResolution }),
    [channel, resolution, theater, toggleTheater, play, stop, slotRef],
  );

  return (
    <PlayerContext.Provider value={value}>
      {children}
      <PlayerHost slot={slot} value={value} />
    </PlayerContext.Provider>
  );
}
