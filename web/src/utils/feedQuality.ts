import { Channel } from "../api.js";
import { getMeasured } from "./measuredQuality.js";

// Quality of a channel, best source first:
//  1. measured: the real picture size seen the last time this channel was played on this device
//  2. the channel name or category ("... 4K", "FHD", "(Low BW)")
//  3. unknown, ranked as an ordinary stream between a tagged HD feed and a tagged low-quality one

export interface FeedQuality {
  /** Short label for a badge, or null when nothing says. */
  label: string | null;
  /** Higher is better. */
  rank: number;
  /** True when the label comes from actually playing the channel rather than from its name. */
  measured: boolean;
}

const LABEL_RANK: Record<string, number> = { "4K": 5, "1440p": 4.5, "1080p": 4, HD: 3, "720p": 3, "480p": 1, SD: 1 };

export function feedQuality(channel: Pick<Channel, "id" | "name" | "category">): FeedQuality {
  const measured = getMeasured(channel.id);
  if (measured) return { label: measured, rank: LABEL_RANK[measured] ?? 2.5, measured: true };

  const text = `${channel.name} ${channel.category}`;
  if (/\b(4k|uhd|2160p)\b/i.test(text)) return { label: "4K", rank: 5, measured: false };
  if (/\b(1080p|fhd|full\s?hd)\b/i.test(text)) return { label: "1080p", rank: 4, measured: false };
  if (/\b(1440p|qhd)\b/i.test(text)) return { label: "1440p", rank: 4.5, measured: false };
  if (/\b(720p|hd)\b/i.test(text)) return { label: "HD", rank: 3, measured: false };
  if (/\b(sd|low\s?bw|low\s?bandwidth|lq|480p|540p)\b/i.test(text)) return { label: "SD", rank: 1, measured: false };
  return { label: null, rank: 2.5, measured: false };
}

/** Best quality first; ties keep alphabetical order so the list is stable. */
export function rankFeeds(channels: Channel[]): Channel[] {
  return [...channels].sort((a, b) => feedQuality(b).rank - feedQuality(a).rank || a.name.localeCompare(b.name, undefined, { numeric: true }));
}
