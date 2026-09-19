// Xtream channel lists rarely expose structured resolution data, but providers
// conventionally embed a quality tag directly in the channel name (e.g. "ESPN 4K UHD",
// "BBC One HD"). Parsing that gives an instant, zero-network-cost quality label for
// every channel in the guide, rather than probing each of thousands of streams.
export function qualityFromName(name: string): string | undefined {
  if (/\b(4k|uhd|2160p)\b/i.test(name)) return "4K";
  if (/\b(1440p|qhd)\b/i.test(name)) return "1440p";
  if (/\b(1080p|fhd|full\s?hd)\b/i.test(name)) return "1080p";
  if (/\b(720p|hd)\b/i.test(name)) return "720p";
  if (/\b(480p|sd)\b/i.test(name)) return "480p";
  return undefined;
}

const QUALITY_TAG_PATTERN = /\s*\b(4k|uhd|2160p|1440p|qhd|1080p|fhd|full\s?hd|720p|hd|480p|sd)\b\s*/gi;

export function stripQualityFromName(name: string): string {
  return name.replace(QUALITY_TAG_PATTERN, " ").replace(/\s{2,}/g, " ").trim();
}

// For whichever channel is actually loaded in the player, we get the real answer for
// free from the decoded video frame size once it's available.
export function qualityFromResolution(width: number, height: number): string {
  const w = Math.max(width, height);
  if (w >= 3840) return "4K";
  if (w >= 2560) return "1440p";
  if (w >= 1920) return "1080p";
  if (w >= 1280) return "720p";
  if (w >= 852) return "480p";
  return "SD";
}
