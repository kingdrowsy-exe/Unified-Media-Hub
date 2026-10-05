import { useEffect, useRef } from "react";
import { Channel, SportsGame } from "../../api.js";
import Icon from "../../ui/Icon.js";
import { feedQuality, rankFeeds } from "../../utils/feedQuality.js";
import { stripQualityFromName } from "../../utils/quality.js";
import "../sports.css";

interface StreamPickerProps {
  game: SportsGame;
  channels: Channel[];
  onPick: (channel: Channel) => void;
  onClose: () => void;
}

/** Every channel that carries a game, best quality first. */
export default function StreamPicker({ game, channels, onPick, onClose }: StreamPickerProps) {
  const ranked = rankFeeds(channels);
  // "Best" only when the top feed's name states a quality and beats the next one; otherwise the order is just by name.
  const top = feedQuality(ranked[0]);
  const second = ranked[1] ? feedQuality(ranked[1]) : null;
  const hasBest = !!top.label && (!second || top.rank > second.rank);
  const rankable = new Set(ranked.map((c) => feedQuality(c).rank)).size > 1;
  const firstRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="picker-backdrop" onClick={onClose}>
      <div className="picker" role="dialog" aria-label="Choose a stream" onClick={(e) => e.stopPropagation()}>
        <header className="picker__head">
          <div>
            <h2 className="h3">Choose a stream</h2>
            <p className="muted">
              {game.away.name} at {game.home.name}
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </header>
        <p className="picker__note muted">
          {rankable
            ? `${ranked.length} channels. Quality comes from the channel name, so channels with no tag are grouped together and sorted by name.`
            : `${ranked.length} channels. None of these names say their quality, so they are listed by name.`}
        </p>
        <ul className="picker__list">
          {ranked.map((channel, i) => {
            const q = feedQuality(channel);
            return (
              <li key={channel.id}>
                <button type="button" className="feed" ref={i === 0 ? firstRef : undefined} onClick={() => onPick(channel)}>
                  <span className="feed__rank nums">{i + 1}</span>
                  <span className="feed__text">
                    <span className="feed__name">{stripQualityFromName(channel.name)}</span>
                    <span className="feed__cat">{channel.category}</span>
                  </span>
                  {hasBest && i === 0 && <span className="tag tag--accent">Best</span>}
                  {q.label && <span className={`tag ${q.label === "4K" ? "tag--accent" : ""}`}>{q.label}</span>}
                  <Icon name="play" size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
