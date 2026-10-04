import { ReactNode, useEffect, useRef, useState } from "react";
import Icon from "./Icon.js";
import "./ui.css";

interface RowProps {
  title: string;
  /** Small text next to the title, e.g. a count. */
  hint?: string;
  onSeeAll?: () => void;
  children: ReactNode;
}

/** Horizontal carousel with a title, an optional "See all" link and hover arrows. */
export default function Row({ title, hint, onSeeAll, children }: RowProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const update = () => {
      setCanPrev(track.scrollLeft > 4);
      setCanNext(track.scrollLeft + track.clientWidth < track.scrollWidth - 4);
    };
    update();
    track.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(track);
    return () => {
      track.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [children]);

  function page(dir: 1 | -1) {
    const track = trackRef.current;
    if (track) track.scrollBy({ left: dir * track.clientWidth * 0.85, behavior: "smooth" });
  }

  return (
    <section className="row">
      <header className="row__head">
        <h2 className="h2">
          {title}
          {hint && <span className="row__hint">{hint}</span>}
        </h2>
        {onSeeAll && (
          <button type="button" className="row__all" onClick={onSeeAll}>
            See all
            <Icon name="next" size={16} />
          </button>
        )}
      </header>
      <div className="row__body">
        {canPrev && (
          <button type="button" className="row__arrow row__arrow--prev" onClick={() => page(-1)} aria-label="Scroll left">
            <Icon name="back" />
          </button>
        )}
        <div className="row__track" ref={trackRef}>
          {children}
        </div>
        {canNext && (
          <button type="button" className="row__arrow row__arrow--next" onClick={() => page(1)} aria-label="Scroll right">
            <Icon name="next" />
          </button>
        )}
      </div>
    </section>
  );
}
