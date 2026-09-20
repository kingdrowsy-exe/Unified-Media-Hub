import { Transform, TransformCallback } from "node:stream";

// Many IPTV channels (UHD/4K sports especially) ship HEVC video with several audio tracks
// muxed into the one MPEG-TS stream, and the first ones are often E-AC-3 (Dolby Digital
// Plus) with plain AAC tracks listed after. hls.js aborts parsing the whole program table
// the moment it meets an E-AC-3 entry ("Unsupported EC-3 in M2TS"), so the AAC track after
// it is never registered and the channel plays picture with no sound - even though a
// perfectly playable AAC track is right there. Chromium/Electron can't decode E-AC-3 or
// AC-3 anyway, so this rewrites each segment's PMT to drop those entries (and their
// packets), leaving the browser only tracks it can play.

const PACKET_SIZE = 188;
const SYNC_BYTE = 0x47;

const STREAM_AAC_ADTS = 0x0f;
const STREAM_AAC_LATM = 0x11;
const STREAM_PES_PRIVATE = 0x06;
const STREAM_AC3 = 0x81;
const STREAM_EAC3 = 0x87;
const STREAM_EAC3_SAMPLE_AES = 0xc2;

// Descriptor tags that mark a private PES stream as AC-3 / E-AC-3 / DTS.
const PRIVATE_UNSUPPORTED_AUDIO_DESCRIPTORS = new Set([0x6a, 0x7a, 0x7b]);

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i << 24;
    for (let j = 0; j < 8; j++) c = c & 0x80000000 ? (c << 1) ^ 0x04c11db7 : c << 1;
    table[i] = c >>> 0;
  }
  return table;
})();

// CRC-32/MPEG-2: poly 0x04C11DB7, init 0xFFFFFFFF, no reflection, no final xor.
export function mpegCrc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = ((crc << 8) ^ crcTable[((crc >>> 24) ^ byte) & 0xff]) >>> 0;
  return crc >>> 0;
}

interface EsEntry {
  streamType: number;
  pid: number;
  raw: Buffer;
  descriptorTags: number[];
}

function packetPid(packet: Buffer): number {
  return ((packet[1] & 0x1f) << 8) | packet[2];
}

function payloadOffset(packet: Buffer): number {
  const adaptation = (packet[3] >> 4) & 0x3;
  if (adaptation === 2 || adaptation === 3) return 5 + packet[4];
  return 4;
}

function findPmtPid(packet: Buffer): number | null {
  if (!(packet[1] & 0x40)) return null;
  const start = payloadOffset(packet);
  const section = start + 1 + packet[start];
  if (packet[section] !== 0x00) return null;
  const sectionLength = ((packet[section + 1] & 0x0f) << 8) | packet[section + 2];
  const end = section + 3 + sectionLength - 4;
  for (let i = section + 8; i + 4 <= end; i += 4) {
    const program = (packet[i] << 8) | packet[i + 1];
    if (program !== 0) return ((packet[i + 2] & 0x1f) << 8) | packet[i + 3];
  }
  return null;
}

// Returns a rewritten single-packet PMT and the PIDs it dropped, or null to leave the
// packet untouched (not a start-of-section PMT, spans multiple packets, or nothing to drop).
function rewritePmt(packet: Buffer): { packet: Buffer; dropped: number[] } | null {
  if (!(packet[1] & 0x40)) return null;
  const start = payloadOffset(packet);
  const sectionStart = start + 1 + packet[start];
  if (packet[sectionStart] !== 0x02) return null;

  const sectionLength = ((packet[sectionStart + 1] & 0x0f) << 8) | packet[sectionStart + 2];
  const sectionEnd = sectionStart + 3 + sectionLength;
  if (sectionEnd > PACKET_SIZE) return null;

  const pcrPid = ((packet[sectionStart + 8] & 0x1f) << 8) | packet[sectionStart + 9];
  const programInfoLength = ((packet[sectionStart + 10] & 0x0f) << 8) | packet[sectionStart + 11];
  const esStart = sectionStart + 12 + programInfoLength;
  const esEnd = sectionEnd - 4;

  const entries: EsEntry[] = [];
  for (let i = esStart; i + 5 <= esEnd; ) {
    const esInfoLength = ((packet[i + 3] & 0x0f) << 8) | packet[i + 4];
    const entryEnd = i + 5 + esInfoLength;
    if (entryEnd > esEnd) return null;
    const descriptorTags: number[] = [];
    for (let j = i + 5; j + 2 <= entryEnd; j += 2 + packet[j + 1]) descriptorTags.push(packet[j]);
    entries.push({
      streamType: packet[i],
      pid: ((packet[i + 1] & 0x1f) << 8) | packet[i + 2],
      raw: packet.subarray(i, entryEnd),
      descriptorTags,
    });
    i = entryEnd;
  }

  const hasAac = entries.some((e) => e.streamType === STREAM_AAC_ADTS || e.streamType === STREAM_AAC_LATM);
  // E-AC-3 always goes (hls.js aborts on it). AC-3 and private-PES AC-3/E-AC-3/DTS only go
  // when an AAC track exists to fall back to, so a channel with nothing else keeps its entry.
  const shouldDrop = (e: EsEntry): boolean => {
    if (e.streamType === STREAM_EAC3 || e.streamType === STREAM_EAC3_SAMPLE_AES) return true;
    if (!hasAac) return false;
    if (e.streamType === STREAM_AC3) return true;
    return (
      e.streamType === STREAM_PES_PRIVATE && e.descriptorTags.some((t) => PRIVATE_UNSUPPORTED_AUDIO_DESCRIPTORS.has(t))
    );
  };

  const dropped = entries.filter(shouldDrop);
  if (dropped.length === 0 || dropped.some((e) => e.pid === pcrPid)) return null;
  const kept = entries.filter((e) => !shouldDrop(e));

  const header = packet.subarray(sectionStart, esStart);
  const body = Buffer.concat([header, ...kept.map((e) => e.raw)]);
  const newSectionLength = body.length - 3 + 4;

  const section = Buffer.concat([body, Buffer.alloc(4)]);
  section[1] = (section[1] & 0xf0) | ((newSectionLength >> 8) & 0x0f);
  section[2] = newSectionLength & 0xff;
  section.writeUInt32BE(mpegCrc32(section.subarray(0, section.length - 4)), section.length - 4);

  const out = Buffer.alloc(PACKET_SIZE, 0xff);
  packet.copy(out, 0, 0, sectionStart);
  section.copy(out, sectionStart);
  return { packet: out, dropped: dropped.map((e) => e.pid) };
}

export function createTsAudioFilter(): Transform {
  let leftover: Buffer = Buffer.alloc(0);
  let passthrough = false;
  let started = false;
  let pmtPid: number | null = null;
  const droppedPids = new Set<number>();

  return new Transform({
    transform(chunk: Buffer, _encoding, callback: TransformCallback) {
      if (passthrough) {
        callback(null, chunk);
        return;
      }

      const data = leftover.length ? Buffer.concat([leftover, chunk]) : chunk;
      if (!started && data.length > 0) {
        started = true;
        if (data[0] !== SYNC_BYTE) {
          passthrough = true;
          callback(null, data);
          return;
        }
      }

      const usable = data.length - (data.length % PACKET_SIZE);
      leftover = data.subarray(usable);
      const out: Buffer[] = [];

      for (let i = 0; i < usable; i += PACKET_SIZE) {
        const packet = data.subarray(i, i + PACKET_SIZE);
        if (packet[0] !== SYNC_BYTE) {
          // Lost sync - stop touching the stream rather than corrupt it further.
          passthrough = true;
          out.push(data.subarray(i));
          leftover = Buffer.alloc(0);
          break;
        }
        const pid = packetPid(packet);
        if (pid === 0) {
          pmtPid = findPmtPid(packet) ?? pmtPid;
          out.push(packet);
        } else if (pid === pmtPid) {
          const rewritten = rewritePmt(packet);
          if (rewritten) {
            for (const dropped of rewritten.dropped) droppedPids.add(dropped);
            out.push(rewritten.packet);
          } else {
            out.push(packet);
          }
        } else if (droppedPids.has(pid)) {
          continue;
        } else {
          out.push(packet);
        }
      }

      callback(null, out.length ? Buffer.concat(out) : undefined);
    },
    flush(callback: TransformCallback) {
      callback(null, leftover.length ? leftover : undefined);
    },
  });
}
