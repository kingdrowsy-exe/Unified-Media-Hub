import type { FastifyInstance } from "fastify";
import { cached } from "../cache.js";
import { getMovieDetails, getTvDetails } from "../clients/tmdb.js";
import { getPlexMediaVersions, PlexMediaVersion } from "../clients/plex.js";
import { getSiloMediaVersions, SiloMediaVersion } from "../clients/silo.js";
import { getRatingAndComments } from "../clients/trakt.js";
import { searchOwnedLibrary } from "../library.js";
import { matchKey } from "../merge.js";
import { NotConfiguredError } from "../settingsStore.js";

export interface SourceVersion {
  source: "plex" | "silo";
  id: string;
  serverName: string;
  filename?: string;
  size?: number;
  resolution?: string;
  videoCodec?: string;
  audioCodec?: string;
  audioChannels?: number;
  container?: string;
  hdr?: string;
  badges: string[];
}

function formatResolution(res?: string): string | undefined {
  if (!res) return undefined;
  const lower = res.toLowerCase();
  if (lower === "4k" || lower === "2160" || lower === "2160p" || lower === "2160i" || lower === "uhd") return "4K";
  if (lower === "1080" || lower === "1080p" || lower === "1080i") return "1080p";
  if (lower === "720" || lower === "720p") return "720p";
  if (lower === "480" || lower === "480p") return "480p";
  return res;
}

function parseFilename(filename?: string): { remux: boolean; dolbyVision: boolean; atmos: boolean; hdr10: boolean } {
  if (!filename) return { remux: false, dolbyVision: false, atmos: false, hdr10: false };
  const lower = filename.toLowerCase();
  return {
    remux: lower.includes("remux"),
    dolbyVision: lower.includes("dv") || lower.includes("dolby vision") || lower.includes("dolbyvision"),
    atmos: lower.includes("atmos"),
    hdr10: lower.includes("hdr10") || lower.includes("hdr"),
  };
}

function parseVideoCodecFromFilename(filename?: string): string | undefined {
  if (!filename) return undefined;
  const lower = filename.toLowerCase();
  if (lower.includes("hevc") || lower.includes("h265") || lower.includes("h.265") || lower.includes("x265")) return "HEVC";
  if (lower.includes("h264") || lower.includes("h.264") || lower.includes("x264") || lower.includes("avc")) return "H264";
  if (lower.includes("av1")) return "AV1";
  if (lower.includes("vp9")) return "VP9";
  return undefined;
}

function parseAudioCodecFromFilename(filename?: string): string | undefined {
  if (!filename) return undefined;
  const lower = filename.toLowerCase();
  if (lower.includes("truehd")) return "TrueHD";
  if (lower.includes("dts-hd") || lower.includes("dtshd") || lower.includes("dts-hd ma")) return "DTS-HD";
  if (lower.includes("dts")) return "DTS";
  if (lower.includes("eac3") || lower.includes("e-ac-3") || lower.includes("ddp")) return "EAC3";
  if (lower.includes("flac")) return "FLAC";
  if (lower.includes("aac")) return "AAC";
  return undefined;
}

function parseResolutionFromFilename(filename?: string): string | undefined {
  if (!filename) return undefined;
  const lower = filename.toLowerCase();
  if (lower.includes("2160p") || lower.includes("4k") || lower.includes("uhd")) return "4K";
  if (lower.includes("1080p") || lower.includes("1080i")) return "1080p";
  if (lower.includes("720p")) return "720p";
  if (lower.includes("480p")) return "480p";
  return undefined;
}

function buildBadges(opts: {
  resolution?: string;
  videoCodec?: string;
  audioCodec?: string;
  audioChannels?: number;
  filename?: string;
  hdr?: string;
  source: "plex" | "silo";
}): string[] {
  const badges: string[] = [];
  const parsed = parseFilename(opts.filename);

  const res = formatResolution(opts.resolution) ?? parseResolutionFromFilename(opts.filename);
  if (res) badges.push(res);
  if (parsed.dolbyVision) badges.push("DV");
  else if (parsed.hdr10 || opts.hdr) badges.push("HDR");
  if (parsed.remux) badges.push("Remux");

  const videoCodec = opts.videoCodec ?? parseVideoCodecFromFilename(opts.filename);
  if (videoCodec) {
    const vc = videoCodec.toUpperCase();
    if (vc === "H264" || vc === "AVC") badges.push("H264");
    else if (vc === "HEVC" || vc === "H265") badges.push("HEVC");
    else if (vc === "AV1") badges.push("AV1");
    else badges.push(vc);
  }

  const audioCodec = opts.audioCodec ?? parseAudioCodecFromFilename(opts.filename);
  if (audioCodec) {
    const ac = audioCodec.toLowerCase();
    if (ac.includes("truehd")) badges.push("TrueHD");
    else if (ac.includes("dts-hd") || ac.includes("dtshd")) badges.push("DTS-HD");
    else if (ac.includes("dts")) badges.push("DTS");
    else if (ac.includes("eac3") || ac.includes("e-ac-3")) badges.push("EAC3");
    else if (ac.includes("aac")) badges.push("AAC");
    else if (ac.includes("flac")) badges.push("FLAC");
    else badges.push(audioCodec.toUpperCase());
  }

  if (parsed.atmos) badges.push("Atmos");

  if (opts.audioChannels) {
    if (opts.audioChannels >= 8) badges.push("7.1");
    else if (opts.audioChannels >= 6) badges.push("5.1");
    else if (opts.audioChannels === 2) badges.push("Stereo");
  }

  return badges;
}

function plexToSourceVersion(v: PlexMediaVersion): SourceVersion {
  return {
    source: "plex",
    id: v.ratingKey,
    serverName: "Plex",
    filename: v.filename,
    size: v.size,
    resolution: formatResolution(v.videoResolution),
    videoCodec: v.videoCodec,
    audioCodec: v.audioCodec,
    audioChannels: v.audioChannels,
    container: v.container,
    badges: buildBadges({
      resolution: v.videoResolution,
      videoCodec: v.videoCodec,
      audioCodec: v.audioCodec,
      audioChannels: v.audioChannels,
      filename: v.filename,
      source: "plex",
    }),
  };
}

function siloToSourceVersion(v: SiloMediaVersion): SourceVersion {
  return {
    source: "silo",
    id: v.contentId,
    serverName: "Silo",
    filename: v.filename,
    size: v.size,
    resolution: formatResolution(v.resolution),
    videoCodec: v.videoCodec,
    audioCodec: v.audioCodec,
    audioChannels: v.audioChannels,
    hdr: v.hdr,
    badges: buildBadges({
      resolution: v.resolution,
      videoCodec: v.videoCodec,
      audioCodec: v.audioCodec,
      audioChannels: v.audioChannels,
      filename: v.filename,
      hdr: v.hdr,
      source: "silo",
    }),
  };
}

const RESOLUTION_RANK: Record<string, number> = {
  "4K": 0,
  "1080p": 1,
  "720p": 2,
  "480p": 3,
};

function resolutionRank(resolution?: string): number {
  if (!resolution) return 99;
  return RESOLUTION_RANK[resolution] ?? 50;
}

// Highest quality first - 4K always leads, regardless of which source/order it came from.
function sortByQuality(versions: SourceVersion[]): SourceVersion[] {
  return [...versions].sort((a, b) => resolutionRank(a.resolution) - resolutionRank(b.resolution));
}

export async function detailsRoutes(app: FastifyInstance) {
  app.get("/api/details/:type/:id", async (request) => {
    const { type, id } = request.params as { type: string; id: string };
    const tmdbId = Number(id);
    if (!tmdbId || (type !== "movie" && type !== "show")) {
      return { error: "Invalid type or id" };
    }
    return cached(`details:${type}:${tmdbId}`, 300, async () => {
      const tmdb = await (type === "movie" ? getMovieDetails(tmdbId) : getTvDetails(tmdbId));
      try {
        const { rating, comments } = await getRatingAndComments(tmdbId, type);
        return { ...tmdb, traktRating: rating, traktComments: comments };
      } catch {
        // Trakt not configured or unreachable - the page still works with TMDB data alone.
        return { ...tmdb, traktRating: null, traktComments: [] };
      }
    });
  });

  app.get("/api/sources", async (request) => {
    const { title, year } = request.query as { title?: string; year?: string };
    if (!title) return { versions: [] };

    const { merged } = await searchOwnedLibrary(title);
    const targetKey = matchKey(title, year ? Number(year) : undefined);
    const matches = merged.filter((item) => matchKey(item.title, item.year) === targetKey);

    const versions: SourceVersion[] = [];

    for (const match of matches) {
      for (const src of match.sources) {
        try {
          if (src.source === "plex") {
            const plexVersions = await getPlexMediaVersions(src.id);
            versions.push(...plexVersions.map(plexToSourceVersion));
          } else if (src.source === "silo") {
            const siloVersions = await getSiloMediaVersions(src.id);
            versions.push(...siloVersions.map(siloToSourceVersion));
          }
        } catch {
          // Source not reachable, skip
        }
      }
    }

    return { versions: sortByQuality(versions) };
  });
}
