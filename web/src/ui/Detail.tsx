import "./detail.css";
import { useEffect, useRef, useState } from "react";
import {
  fetchDetails,
  fetchSources,
  lookupTmdbId,
  PopularItem,
  MergedItem,
  TmdbDetails,
  Source,
  SourceVersion,
  streamUrlFor,
} from "../api.js";
import Icon from "./Icon.js";
import MediaPlayer from "./MediaPlayer.js";
import PosterCard from "./PosterCard.js";
import Row from "./Row.js";

type Playable = MergedItem | PopularItem;

interface DetailProps {
  item: Playable;
  onClose: () => void;
  onSelectSimilar: (tmdbId: number, type: "movie" | "show") => void;
}

const SOURCE_LABELS: Record<Source, string> = { plex: "Plex", silo: "Silo", emby: "Emby" };

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

export default function Detail({ item, onClose, onSelectSimilar }: DetailProps) {
  const [details, setDetails] = useState<TmdbDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [sources, setSources] = useState<SourceVersion[] | null>(null);
  const [sourceFilter, setSourceFilter] = useState<"all" | Source>("all");
  const [loadingSources, setLoadingSources] = useState(false);
  const [playingSrc, setPlayingSrc] = useState<string | null>(null);
  const [theater, setTheater] = useState(false);
  const [overviewExpanded, setOverviewExpanded] = useState(false);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
    setDetails(null);
    setError(null);
    setSources(null);
    setSourceFilter("all");
    setPlayingSrc(null);
    setOverviewExpanded(false);
    setRevealed(new Set());
  }, [item.id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const parsed = parseTmdbId(item.id);
    setLoading(true);

    // Items from a Plex/Silo library search carry the provider's own id, not a TMDB one
    // (unlike Popular/Trakt items, which come from TMDB already) - look the title up on
    // TMDB first so the detail page can still show the full backdrop/cast/similar view.
    const resolveTmdbId = parsed
      ? Promise.resolve(parsed.tmdbId)
      : lookupTmdbId(item.title, item.year, item.type).then((res) => res.tmdbId);
    const type = parsed?.type ?? item.type;

    let cancelled = false;
    resolveTmdbId
      .then((tmdbId) => {
        if (cancelled) return;
        if (!tmdbId) {
          setLoading(false);
          return;
        }
        return fetchDetails(type, tmdbId).then((d) => {
          if (!cancelled) setDetails(d);
        });
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load details");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [item.id]);

  async function handlePlay() {
    setLoadingSources(true);
    setSources(null);
    setError(null);
    try {
      const result = await fetchSources(item.title, item.year);
      if (result.versions.length === 0) {
        setError("This title isn't in your connected libraries.");
        return;
      }
      if (result.versions.length === 1) {
        const v = result.versions[0];
        setPlayingSrc(streamUrlFor(v.source, v.id));
        return;
      }
      setSourceFilter("all");
      setSources(result.versions);
    } catch {
      setError("Couldn't check your libraries.");
    } finally {
      setLoadingSources(false);
    }
  }

  function handleSourceSelect(version: SourceVersion) {
    setSources(null);
    setPlayingSrc(streamUrlFor(version.source, version.id));
  }

  function stopPlaying() {
    setPlayingSrc(null);
    setTheater(false);
  }

  const backdrop = details?.backdrop ?? ("backdrop" in item ? (item as PopularItem).backdrop : undefined) ?? item.poster;
  const poster = details?.poster ?? item.poster;
  const displayTitle = details?.title || item.title;
  const year = details?.releaseDate?.slice(0, 4) ?? (item.year ? String(item.year) : "");
  const runtime = formatRuntime(details?.runtime);
  const genres = details?.genres ?? (item.genre ? [item.genre] : []);
  const rating = details?.voteAverage ?? (item.ratingPercent ? item.ratingPercent / 10 : 0);
  const overview = details?.overview ?? "";
  const metaParts = [year, runtime, genres.join(", ")].filter(Boolean);

  const sourceKinds = sources ? Array.from(new Set(sources.map((v) => v.source))) : [];
  const filteredSources = sources ? (sourceFilter === "all" ? sources : sources.filter((v) => v.source === sourceFilter)) : [];

  return (
    <div className="detail" ref={scrollRef}>
      {playingSrc ? (
        <div className={`detail__stage detail__stage--player ${theater ? "is-theater" : ""}`}>
          <MediaPlayer
            src={playingSrc}
            title={displayTitle}
            subtitle={metaParts.join(" · ") || undefined}
            durationHint={details?.runtime ? details.runtime * 60 : undefined}
            theater={theater}
            onToggleTheater={() => setTheater((t) => !t)}
            onClose={stopPlaying}
          />
          <div className="detail__playerbar">
            <button type="button" className="btn btn--quiet btn--sm" onClick={stopPlaying}>
              <Icon name="back" size={18} />
              Back to details
            </button>
            <button type="button" className="btn btn--quiet btn--sm" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      ) : (
        <div className="detail__hero">
          {backdrop && <img src={backdrop} alt="" />}
          <button type="button" className="detail__back icon-btn" onClick={onClose} aria-label="Back">
            <Icon name="back" />
          </button>
        </div>
      )}

      <div className="detail__body">
        <div className="detail__top">
          {poster && (
            <div className="detail__poster">
              <img src={poster} alt="" />
            </div>
          )}
          <div className="detail__info">
            <h1 className="h1">{displayTitle}</h1>

            {(metaParts.length > 0 || rating > 0 || details?.traktRating) && (
              <div className="detail__meta">
                {year && <span className="tag">{year}</span>}
                {runtime && <span className="tag">{runtime}</span>}
                {genres.map((g) => (
                  <span key={g} className="tag">
                    {g}
                  </span>
                ))}
                {rating > 0 && (
                  <span className="tag tag--accent">
                    <Icon name="star" size={12} />
                    TMDB {rating.toFixed(1)}
                  </span>
                )}
                {details?.traktRating && (
                  <span className="tag tag--accent">
                    <Icon name="star" size={12} />
                    Trakt {details.traktRating.rating.toFixed(1)}
                  </span>
                )}
              </div>
            )}

            {details?.tagline && <div className="detail__tagline">{details.tagline}</div>}

            {overview && (
              <div className="detail__overview">
                <p className={overviewExpanded ? "" : "is-clamped"}>{overview}</p>
                {overview.length > 200 && (
                  <button type="button" className="detail__more" onClick={() => setOverviewExpanded(!overviewExpanded)}>
                    {overviewExpanded ? "less" : "more"}
                  </button>
                )}
              </div>
            )}

            {!playingSrc && (
              <button type="button" className="btn btn--primary" onClick={handlePlay} disabled={loadingSources}>
                {loadingSources ? (
                  "Checking libraries…"
                ) : (
                  <>
                    <Icon name="play" size={18} />
                    Play
                  </>
                )}
              </button>
            )}

            {error && <div className="detail__error">{error}</div>}
          </div>
        </div>

        {sources && !playingSrc && (
          <section className="detail__picker">
            <h2 className="h2">Choose a version</h2>
            {sourceKinds.length > 1 && (
              <div className="chips">
                {(["all", ...sourceKinds] as ("all" | Source)[]).map((f) => (
                  <button key={f} type="button" className="chip" aria-pressed={sourceFilter === f} onClick={() => setSourceFilter(f)}>
                    {f === "all" ? "All" : SOURCE_LABELS[f]}
                  </button>
                ))}
              </div>
            )}
            <div className="detail__versions">
              {filteredSources.map((v, i) => (
                <button key={i} type="button" className="version" onClick={() => handleSourceSelect(v)}>
                  <span className="version__head">
                    <span>{v.serverName}</span>
                    {v.size ? <span className="muted">{formatSize(v.size)}</span> : null}
                  </span>
                  {v.filename && <span className="version__file">{v.filename}</span>}
                  {v.badges.length > 0 && (
                    <span className="version__tags">
                      {v.badges.map((b, j) => (
                        <span key={j} className="tag">
                          {b}
                        </span>
                      ))}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </section>
        )}

        {details?.cast && details.cast.length > 0 && (
          <section className="detail__section">
            <h2 className="h2">Cast</h2>
            <div className="cast">
              {details.cast.map((member, i) => (
                <div key={i} className="cast__person">
                  <div className="cast__photo">{member.profilePath && <img src={member.profilePath} alt="" loading="lazy" />}</div>
                  <div className="cast__name">{member.name}</div>
                  <div className="cast__role">{member.character}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {details?.traktComments && details.traktComments.length > 0 && (
          <section className="detail__section">
            <h2 className="h2">
              Reviews <span className="muted h3">from Trakt</span>
            </h2>
            <div className="reviews">
              {details.traktComments.map((c) => {
                const hidden = c.spoiler && !revealed.has(c.id);
                return (
                  <div key={c.id} className="review">
                    <div className="review__head">
                      <span className="review__user">{c.username}</span>
                      <span className="muted">
                        {new Date(c.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
                      </span>
                      {c.spoiler && <span className="tag">Spoiler</span>}
                      {c.likes > 0 && <span className="tag">▲ {c.likes}</span>}
                    </div>
                    <p
                      className={`review__text ${hidden ? "is-spoiler" : ""}`}
                      onClick={hidden ? () => setRevealed((prev) => new Set(prev).add(c.id)) : undefined}
                    >
                      {c.comment}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {details?.similar && details.similar.length > 0 && (
          <div className="detail__section">
            <Row title="Similar">
              {details.similar.map((s) => (
                <PosterCard
                  key={s.id}
                  image={s.poster}
                  title={s.title}
                  meta={[s.year, s.genre].filter(Boolean).join(" · ")}
                  ratingPercent={s.ratingPercent}
                  onClick={() => onSelectSimilar(s.id, s.type)}
                />
              ))}
            </Row>
          </div>
        )}

        {loading && <div className="detail__loading">Loading…</div>}
      </div>
    </div>
  );
}
