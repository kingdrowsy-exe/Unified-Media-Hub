import { useEffect, useRef, useState } from "react";
import {
  fetchDetails,
  fetchSources,
  PopularItem,
  MergedItem,
  TmdbDetails,
  SourceVersion,
  streamUrlFor,
} from "../api.js";
import SourcePicker from "./SourcePicker.js";
import Player from "./Player.js";
import Shelf from "./Shelf.js";
import Tile from "./Tile.js";

type Playable = MergedItem | PopularItem;

interface MovieDetailProps {
  item: Playable;
  onClose: () => void;
  onSelectSimilar: (tmdbId: number, type: "movie" | "show") => void;
}

function parseTmdbId(id: string): { type: "movie" | "show"; tmdbId: number } | null {
  const match = id.match(/^tmdb:(movie|show):(\d+)$/);
  if (!match) return null;
  return { type: match[1] as "movie" | "show", tmdbId: Number(match[2]) };
}

function formatRuntime(minutes?: number): string {
  if (!minutes) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatSize(bytes?: number): string {
  if (!bytes) return "";
  const gb = bytes / (1024 * 1024 * 1024);
  return gb >= 1 ? `${gb.toFixed(2)} GB` : `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

export default function MovieDetail({ item, onClose, onSelectSimilar }: MovieDetailProps) {
  const [details, setDetails] = useState<TmdbDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [sources, setSources] = useState<SourceVersion[] | null>(null);
  const [loadingSources, setLoadingSources] = useState(false);
  const [playingSrc, setPlayingSrc] = useState<string | null>(null);
  const [overviewExpanded, setOverviewExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
    setDetails(null);
    setError(null);
    setSources(null);
    setShowSourcePicker(false);
    setPlayingSrc(null);
    setOverviewExpanded(false);
  }, [item.id]);

  useEffect(() => {
    const parsed = parseTmdbId(item.id);
    if (!parsed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchDetails(parsed.type, parsed.tmdbId)
      .then(setDetails)
      .catch(() => setError("Couldn't load details"))
      .finally(() => setLoading(false));
  }, [item.id]);

  async function handlePlay() {
    setLoadingSources(true);
    setSources(null);
    try {
      const result = await fetchSources(item.title, item.year);
      if (result.versions.length === 0) {
        setError("This title isn't in your connected libraries.");
        setLoadingSources(false);
        return;
      }
      if (result.versions.length === 1) {
        const v = result.versions[0];
        setPlayingSrc(streamUrlFor(v.source, v.id));
        setLoadingSources(false);
        return;
      }
      setSources(result.versions);
      setShowSourcePicker(true);
    } catch {
      setError("Couldn't check your libraries.");
    } finally {
      setLoadingSources(false);
    }
  }

  function handleSourceSelect(version: SourceVersion) {
    setShowSourcePicker(false);
    setPlayingSrc(streamUrlFor(version.source, version.id));
  }

  const backdrop = details?.backdrop ?? ("backdrop" in item ? (item as PopularItem).backdrop : undefined) ?? item.poster;
  const displayTitle = details?.title ?? item.title;
  const year = details?.releaseDate?.slice(0, 4) ?? (item.year ? String(item.year) : "");
  const runtime = formatRuntime(details?.runtime);
  const genreStr = details?.genres?.join(", ") ?? item.genre ?? "";
  const rating = details?.voteAverage ?? (item.ratingPercent ? item.ratingPercent / 10 : 0);
  const overview = details?.overview ?? "";

  const metaParts = [year, runtime, genreStr].filter(Boolean);

  return (
    <div className="detail-overlay">
      <div className="detail-scroll" ref={scrollRef}>
        <button className="detail-back" onClick={onClose} aria-label="Back">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        {/* Backdrop */}
        <div className="detail-backdrop">
          {backdrop && <img src={backdrop} alt="" />}
          <div className="detail-backdrop-scrim" />
        </div>

        {/* Main info */}
        <div className="detail-body">
          <h1 className="detail-title">{displayTitle}</h1>

          {metaParts.length > 0 && (
            <div className="detail-meta">{metaParts.join(" · ")}</div>
          )}

          {(rating > 0 || details?.traktRating) && (
            <div className="detail-rating">
              {rating > 0 && (
                <span className="detail-rating-group">
                  <span className="detail-rating-badge">TMDB</span>
                  <span className="detail-rating-value">{rating.toFixed(1)}</span>
                </span>
              )}
              {details?.traktRating && (
                <span className="detail-rating-group">
                  <span className="detail-rating-badge detail-rating-badge-trakt">Trakt</span>
                  <span className="detail-rating-value">{(details.traktRating.rating).toFixed(1)}</span>
                  <span className="detail-rating-votes">({details.traktRating.votes.toLocaleString()})</span>
                </span>
              )}
            </div>
          )}

          {details?.tagline && (
            <div className="detail-tagline">{details.tagline}</div>
          )}

          {overview && (
            <div className="detail-overview">
              <p className={overviewExpanded ? "" : "detail-overview-clamped"}>
                {overview}
              </p>
              {overview.length > 200 && (
                <button
                  className="detail-more-btn"
                  onClick={() => setOverviewExpanded(!overviewExpanded)}
                >
                  {overviewExpanded ? "less" : "more"}
                </button>
              )}
            </div>
          )}

          {error && <div className="detail-error">{error}</div>}

          {/* Action buttons */}
          <div className="detail-actions">
            <button
              className="detail-play-btn"
              onClick={handlePlay}
              disabled={loadingSources}
            >
              {loadingSources ? "Checking…" : "▶ Play"}
            </button>
          </div>

          {/* Cast */}
          {details?.cast && details.cast.length > 0 && (
            <div className="detail-section">
              <h2 className="detail-section-title">Cast</h2>
              <div className="detail-cast-row">
                {details.cast.map((member, i) => (
                  <div key={i} className="detail-cast-card">
                    <div className="detail-cast-photo">
                      {member.profilePath ? (
                        <img src={member.profilePath} alt={member.name} loading="lazy" />
                      ) : (
                        <div className="detail-cast-photo-empty" />
                      )}
                    </div>
                    <div className="detail-cast-name">{member.name}</div>
                    <div className="detail-cast-character">{member.character}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reviews */}
          {details?.traktComments && details.traktComments.length > 0 && (
            <div className="detail-section">
              <h2 className="detail-section-title">Reviews <span className="detail-section-source">from Trakt</span></h2>
              <div className="detail-reviews">
                {details.traktComments.map((c) => (
                  <div key={c.id} className="review-card">
                    <div className="review-card-header">
                      <span className="review-avatar">{c.username.slice(0, 1).toUpperCase()}</span>
                      <div>
                        <div className="review-username">{c.username}</div>
                        <div className="review-meta">
                          Trakt · {new Date(c.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
                          {c.spoiler && <span className="review-spoiler-tag">Spoiler</span>}
                        </div>
                      </div>
                      {c.likes > 0 && <span className="review-likes">▲ {c.likes}</span>}
                    </div>
                    <p className={`review-text ${c.spoiler ? "review-text-spoiler" : ""}`}>{c.comment}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Similar */}
          {details?.similar && details.similar.length > 0 && (
            <Shelf title="Similar">
              {details.similar.map((s) => (
                <Tile
                  key={s.id}
                  image={s.poster}
                  title={s.title}
                  year={s.year}
                  genre={s.genre}
                  ratingPercent={s.ratingPercent}
                  owned
                  onClick={() => onSelectSimilar(s.id, s.type)}
                />
              ))}
            </Shelf>
          )}
        </div>
      </div>

      {/* Source picker sheet */}
      {showSourcePicker && sources && (
        <SourcePicker
          title={displayTitle}
          versions={sources}
          onSelect={handleSourceSelect}
          onClose={() => setShowSourcePicker(false)}
        />
      )}

      {/* Video player */}
      {playingSrc && (
        <Player
          src={playingSrc}
          title={displayTitle}
          subtitle={metaParts.join(" · ") || undefined}
          durationHint={details?.runtime ? details.runtime * 60 : undefined}
          onClose={() => setPlayingSrc(null)}
        />
      )}

      {loading && <div className="detail-loading">Loading…</div>}
    </div>
  );
}
