import { ReactNode, useEffect, useRef, useState } from "react";

interface ShelfProps {
  title: string;
  children: ReactNode;
  onTitleClick?: () => void;
}

export default function Shelf({ title, children, onTitleClick }: ShelfProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  function updateScrollState() {
    const row = rowRef.current;
    if (!row) return;
    setCanScrollLeft(row.scrollLeft > 4);
    setCanScrollRight(row.scrollLeft + row.clientWidth < row.scrollWidth - 4);
  }

  useEffect(() => {
    updateScrollState();
    const row = rowRef.current;
    if (!row) return;

    row.addEventListener("scroll", updateScrollState);
    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(row);

    return () => {
      row.removeEventListener("scroll", updateScrollState);
      resizeObserver.disconnect();
    };
  }, [children]);

  function scrollByAmount(direction: 1 | -1) {
    const row = rowRef.current;
    if (!row) return;
    row.scrollBy({ left: direction * row.clientWidth * 0.8, behavior: "smooth" });
  }

  return (
    <section className="shelf">
      {onTitleClick ? (
        <button type="button" className="shelf-title shelf-title-button" onClick={onTitleClick}>
          {title}
          <span className="shelf-chevron">›</span>
        </button>
      ) : (
        <h2 className="shelf-title">
          {title}
          <span className="shelf-chevron">›</span>
        </h2>
      )}
      <div className="shelf-row" ref={rowRef}>
        {children}
      </div>
      <div className="shelf-pager">
        <button
          className="shelf-pager-btn"
          onClick={() => scrollByAmount(-1)}
          disabled={!canScrollLeft}
          aria-label="Scroll left"
        >
          ‹
        </button>
        <button
          className="shelf-pager-btn"
          onClick={() => scrollByAmount(1)}
          disabled={!canScrollRight}
          aria-label="Scroll right"
        >
          ›
        </button>
      </div>
    </section>
  );
}
