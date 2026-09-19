import { ReactNode, useEffect, useRef, useState } from "react";

interface ShelfProps {
  title: string;
  children: ReactNode;
}

export default function Shelf({ title, children }: ShelfProps) {
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

    // A vertical mouse wheel is the common way people try to scroll a horizontal row -
    // translate it instead of leaving the row inert until someone finds a trackpad swipe.
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      row.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    row.addEventListener("wheel", onWheel, { passive: false });
    row.addEventListener("scroll", updateScrollState);
    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(row);

    return () => {
      row.removeEventListener("wheel", onWheel);
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
      <h2 className="shelf-title">
        {title}
        <span className="shelf-chevron">›</span>
      </h2>
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
