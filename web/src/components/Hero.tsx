import { useEffect, useRef, useState } from "react";

export interface HeroItem {
  image?: string;
  title: string;
  subtitle?: string;
  owned: boolean;
  onPlay: () => void;
}

interface HeroProps {
  items: HeroItem[];
  intervalMs?: number;
}

export default function Hero({ items, intervalMs = 7000 }: HeroProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [prevIndex, setPrevIndex] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const currentIndexRef = useRef(0);
  const clearPrevTimeout = useRef<number>();

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  // Reset to the first slide whenever the underlying item set changes (e.g. switching
  // the source filter) so we don't end up pointing past the end of a shorter list.
  useEffect(() => {
    setCurrentIndex(0);
    setPrevIndex(null);
  }, [items.length]);

  function goTo(index: number) {
    if (items.length === 0) return;
    const next = ((index % items.length) + items.length) % items.length;
    if (next === currentIndexRef.current) return;
    setPrevIndex(currentIndexRef.current);
    setCurrentIndex(next);
    window.clearTimeout(clearPrevTimeout.current);
    clearPrevTimeout.current = window.setTimeout(() => setPrevIndex(null), 900);
  }

  useEffect(() => {
    if (items.length <= 1 || paused) return;
    const id = window.setInterval(() => {
      goTo(currentIndexRef.current + 1);
    }, intervalMs);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, paused, intervalMs]);

  const current = items[currentIndex];
  const previous = prevIndex !== null ? items[prevIndex] : undefined;

  if (!current) return null;

  return (
    <div className="hero" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      {previous?.image && (
        <div className="hero-bg hero-bg-prev" style={{ backgroundImage: `url(${previous.image})` }} />
      )}
      {current.image && <div className="hero-bg" style={{ backgroundImage: `url(${current.image})` }} />}
      <div className="hero-scrim" />

      {items.length > 1 && (
        <>
          <button className="hero-nav hero-nav-prev" onClick={() => goTo(currentIndex - 1)} aria-label="Previous">
            ‹
          </button>
          <button className="hero-nav hero-nav-next" onClick={() => goTo(currentIndex + 1)} aria-label="Next">
            ›
          </button>
        </>
      )}

      <div className="hero-content">
        <div className="hero-eyebrow">Popular Now</div>
        <div className="hero-title">{current.title}</div>
        {current.subtitle && <div className="hero-subtitle">{current.subtitle}</div>}
        <div className="hero-actions">
          {current.owned ? (
            <button className="hero-play" onClick={current.onPlay}>
              ▶ Play
            </button>
          ) : (
            <>
              <button className="hero-play hero-play-secondary" onClick={current.onPlay}>
                Details
              </button>
              <span className="hero-unowned">Not in your library</span>
            </>
          )}
        </div>
      </div>

      {items.length > 1 && (
        <div className="hero-dots">
          {items.map((_, i) => (
            <button
              key={i}
              className={`hero-dot ${i === currentIndex ? "active" : ""}`}
              onClick={() => goTo(i)}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
