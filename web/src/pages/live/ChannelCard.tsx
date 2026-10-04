import { useRef } from "react";
import { Channel } from "../../api.js";
import { epgProgress, formatClock, useNowPlaying } from "../../hooks/useEpg.js";
import { useInView } from "../../hooks/useInView.js";
import { qualityFromName, stripQualityFromName } from "../../utils/quality.js";
import Icon from "../../ui/Icon.js";

interface ChannelCardProps {
  channel: Channel;
  active?: boolean;
  favorite?: boolean;
  onPlay: (channel: Channel) => void;
  onToggleFavorite?: (channel: Channel) => void;
  /** card = 16:9 tile for carousels and grids. row = compact line for lists. */
  variant?: "card" | "row";
}

function Logo({ channel }: { channel: Channel }) {
  return channel.icon ? (
    <img src={channel.icon} alt="" loading="lazy" className="chlogo" />
  ) : (
    <span className="chlogo chlogo--blank">{channel.name.slice(0, 2).toUpperCase()}</span>
  );
}

export default function ChannelCard({ channel, active, favorite, onPlay, onToggleFavorite, variant = "card" }: ChannelCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref);
  const now = useNowPlaying(channel.id, visible);
  const progress = epgProgress(now);
  const quality = qualityFromName(channel.name);
  const name = quality ? stripQualityFromName(channel.name) : channel.name;
  const timeLine = now ? `${formatClock(now.start)} – ${formatClock(now.end)}` : channel.category;

  if (variant === "row") {
    return (
      <div ref={ref} className={`chrow ${active ? "is-active" : ""}`}>
        <button type="button" className="chrow__main" onClick={() => onPlay(channel)}>
          <span className="chrow__thumb">
            <Logo channel={channel} />
            {progress !== null && (
              <span className="bar chrow__bar">
                <i style={{ width: `${progress * 100}%` }} />
              </span>
            )}
          </span>
          <span className="chrow__text">
            <span className="chrow__name">
              {name}
              {quality && <span className={`tag ${quality === "4K" ? "tag--accent" : ""}`}>{quality}</span>}
            </span>
            <span className="chrow__now">{now ? now.title : channel.category}</span>
            <span className="chrow__time nums">{timeLine}</span>
          </span>
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} className={`chcard ${active ? "is-active" : ""}`}>
      <button type="button" className="chcard__main" onClick={() => onPlay(channel)}>
        <span className="chcard__art">
          <Logo channel={channel} />
          <span className="chcard__tags">
            <span className="tag tag--live">LIVE</span>
            {quality && <span className={`tag ${quality === "4K" ? "tag--accent" : "tag--glass"}`}>{quality}</span>}
          </span>
          {progress !== null && (
            <span className="bar chcard__bar">
              <i style={{ width: `${progress * 100}%` }} />
            </span>
          )}
        </span>
        <span className="chcard__title">{now ? now.title : name}</span>
        <span className="chcard__meta">
          {now ? `${name} · ` : ""}
          <span className="nums">{now ? timeLine : channel.category}</span>
        </span>
      </button>
      {onToggleFavorite && (
        <button
          type="button"
          className="icon-btn chcard__fav"
          aria-pressed={!!favorite}
          aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
          onClick={() => onToggleFavorite(channel)}
        >
          <Icon name="heart" size={20} />
        </button>
      )}
    </div>
  );
}
