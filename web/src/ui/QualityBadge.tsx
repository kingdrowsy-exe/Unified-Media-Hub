import { Channel } from "../api.js";
import { feedQuality } from "../utils/feedQuality.js";
import { useMeasuredVersion } from "../utils/measuredQuality.js";

interface QualityBadgeProps {
  channel: Pick<Channel, "id" | "name" | "category">;
  /** Translucent version for sitting on top of artwork. */
  glass?: boolean;
}

/** The one place a channel's video quality is drawn. Renders nothing when nothing is known. */
export default function QualityBadge({ channel, glass }: QualityBadgeProps) {
  useMeasuredVersion(); // refresh when a channel gets measured
  const q = feedQuality(channel);
  if (!q.label) return null;
  const tone = q.label === "4K" ? "tag--accent" : glass ? "tag--glass" : q.rank <= 1 ? "tag--dim" : "";
  return (
    <span className={`tag ${tone}`} title={q.measured ? `${q.label}: measured while playing` : `${q.label}: from the channel name`}>
      {q.label}
    </span>
  );
}
