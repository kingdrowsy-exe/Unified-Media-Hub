import { spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import { PassThrough, Readable, pipeline } from "node:stream";
import { createLimiter } from "./concurrencyLimiter.js";

// Some channels carry only AC-3 / E-AC-3 audio (e.g. NFL game feeds: HEVC + AC-3 5.1).
// Chromium/Electron can't decode either, and there's no AAC track to fall back to, so the
// audio has to be converted. The video is stream-copied (never re-encoded), so this costs
// almost no CPU - just the audio decode/encode - but it's still a real process per segment,
// so concurrency is capped.
const MAX_CONCURRENT_TRANSCODES = 2;
const limiter = createLimiter(MAX_CONCURRENT_TRANSCODES);

function resolveFfmpegPath(): string | null {
  try {
    const require = createRequire(import.meta.url);
    const found = require("ffmpeg-static") as string | null;
    if (!found) return null;
    // In a packaged Electron app the binary is unpacked next to app.asar, not inside it.
    const unpacked = found.replace("app.asar", "app.asar.unpacked");
    return fs.existsSync(unpacked) ? unpacked : fs.existsSync(found) ? found : null;
  } catch {
    return null;
  }
}

const ffmpegPath = resolveFfmpegPath();

export function isAudioTranscodeAvailable(): boolean {
  return ffmpegPath !== null;
}

const FFMPEG_ARGS = [
  "-hide_banner",
  "-loglevel", "error",
  // Segments arrive as a pipe, so keep the up-front probe short - the default waits for
  // several seconds of input before emitting anything.
  "-probesize", "2000000",
  "-analyzeduration", "1000000",
  "-i", "pipe:0",
  "-map", "0:v:0",
  "-map", "0:a:0",
  "-c:v", "copy",
  "-c:a", "aac",
  "-b:a", "192k",
  "-ac", "2",
  "-f", "mpegts",
  // Keep the source timestamps so consecutive, independently-converted segments still line up.
  "-copyts",
  "-muxdelay", "0",
  "-muxpreload", "0",
  "pipe:1",
];

// Reads the first `bytes` of `source` without losing them: resolves to that head plus a
// stream that yields the head followed by everything else.
export async function peekHead(source: Readable, bytes: number): Promise<{ head: Buffer; stream: Readable }> {
  const iterator = source[Symbol.asyncIterator]() as AsyncIterator<Buffer>;
  let head = Buffer.alloc(0);
  let finished = false;
  while (head.length < bytes) {
    const next = await iterator.next();
    if (next.done) {
      finished = true;
      break;
    }
    head = Buffer.concat([head, next.value]);
  }

  const stream = Readable.from(
    (async function* () {
      try {
        if (head.length) yield head;
        while (!finished) {
          const next = await iterator.next();
          if (next.done) return;
          yield next.value;
        }
      } finally {
        await iterator.return?.();
      }
    })(),
    { objectMode: false },
  );
  return { head, stream };
}

export function transcodeAudioToAac(source: Readable): Readable {
  const out = new PassThrough();
  if (!ffmpegPath) {
    source.destroy();
    out.end();
    return out;
  }
  const binary = ffmpegPath;

  void limiter(
    () =>
      new Promise<void>((resolve) => {
        if (out.destroyed) {
          source.destroy();
          resolve();
          return;
        }
        const child = spawn(binary, FFMPEG_ARGS, { stdio: ["pipe", "pipe", "ignore"], windowsHide: true });

        // The client going away (seek, channel change, close) must stop the conversion and
        // release the upstream connection, not leave a process grinding through the segment.
        const abort = () => {
          child.kill();
          source.destroy();
        };
        out.once("close", abort);
        child.once("close", () => {
          out.off("close", abort);
          resolve();
        });
        child.once("error", () => out.destroy());
        child.stdin.on("error", () => {});

        pipeline(source, child.stdin, () => {});
        pipeline(child.stdout, out, () => {});
      }),
  );
  return out;
}
