import { Channel } from "../api.js";

// Providers put the quality in the channel name ("... 4K", "FHD", "(Low BW)"), and nowhere else we can see
// without opening the stream. So the ranking is only as good as the names: a channel with no tag is ranked
// as an ordinary stream, between a tagged HD feed and a tagged low-quality one.

export interface FeedQuality {
  /** Short label for a tag, or null when the name gives no hint. */
  label: string | null;
  /** Higher is better. */
  rank: number;
}

export function feedQuality(channel: Pick<Channel, "name" | "category">): FeedQuality {
  const text = `${channel.name} ${channel.category}`;
  if (/\b(4k|uhd|2160p)\b/i.test(text)) return { label: "4K", rank: 5 };
  if (/\b(1080p|fhd|full\s?hd)\b/i.test(text)) return { label: "1080p", rank: 4 };
  if (/\b(1440p|qhd)\b/i.test(text)) return { label: "1440p", rank: 4.5 };
  if (/\b(720p|hd)\b/i.test(text)) return { label: "HD", rank: 3 };
  if (/\b(sd|low\s?bw|low\s?bandwidth|lq|480p|540p)\b/i.test(text)) return { label: "SD", rank: 1 };
  return { label: null, rank: 2.5 };
}

/** Best quality first; ties keep alphabetical order so the list is stable. */
export function rankFeeds(channels: Channel[]): Channel[] {
  return [...channels].sort((a, b) => feedQuality(b).rank - feedQuality(a).rank || a.name.localeCompare(b.name, undefined, { numeric: true }));
}
