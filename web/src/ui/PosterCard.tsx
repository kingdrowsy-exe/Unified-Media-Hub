import SafeImg from "./SafeImg.js";
import "./ui.css";

interface PosterCardProps {
  image?: string;
  title: string;
  /** One quiet line under the title, e.g. "2026 · Sci-Fi". */
  meta?: string;
  /** Small chips over the artwork, e.g. ["4K", "Plex"]. */
  tags?: string[];
  /** Rating 0-100, shown top-right. */
  ratingPercent?: number;
  /** True when the title is not in any connected library. */
  unowned?: boolean;
  onClick: () => void;
}

/** 2:3 poster with left-aligned title and metadata underneath. */
export default function PosterCard({ image, title, meta, tags, ratingPercent, unowned, onClick }: PosterCardProps) {
  return (
    <button type="button" className={`poster ${unowned ? "is-unowned" : ""}`} onClick={onClick}>
      <span className="poster__art">
        <SafeImg src={image} loading="lazy" fallback={<span className="poster__blank">{title}</span>} />
        {tags && tags.length > 0 && (
          <span className="poster__tags">
            {tags.map((t) => (
              <span key={t} className="tag tag--glass">
                {t}
              </span>
            ))}
          </span>
        )}
        {ratingPercent !== undefined && <span className="tag tag--glass poster__rating">{ratingPercent}%</span>}
      </span>
      <span className="poster__title">{title}</span>
      {(meta || unowned) && <span className="poster__meta">{unowned ? [meta, "Not in library"].filter(Boolean).join(" · ") : meta}</span>}
    </button>
  );
}
