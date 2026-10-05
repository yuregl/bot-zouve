import { pipeline, Transform, type Readable } from "node:stream";
import prism from "prism-media";
import { createLogger } from "./logger.js";

const logger = createLogger("opus");

// Frame sizes by Opus configuration (RFC 6716, section 3.1): SILK, hybrid, and CELT modes.
const SILK_FRAME_MS = [10, 20, 40, 60];
const HYBRID_FRAME_MS = [10, 20];
const CELT_FRAME_MS = [2.5, 5, 10, 20];

/** Duration of an Opus packet in milliseconds, read from its table-of-contents byte. */
export function opusPacketDurationMs(packet: Uint8Array): number {
  const toc = packet[0];

  if (toc === undefined) {
    return 0;
  }

  const config = toc >> 3;
  const frameMs =
    config < 12 ? SILK_FRAME_MS[config % 4] : config < 16 ? HYBRID_FRAME_MS[config % 2] : CELT_FRAME_MS[config % 4];

  const frameCountCode = toc & 0b11;
  const frames = frameCountCode === 0 ? 1 : frameCountCode < 3 ? 2 : (packet[1] ?? 0) & 0b11_1111;

  return (frameMs ?? 0) * frames;
}

/** Drops Opus packets until `offsetMs` of audio has been skipped, then passes the rest through. */
export function skipOpusPackets(offsetMs: number): Transform {
  let skippedMs = 0;

  return new Transform({
    objectMode: true,
    transform(packet: Buffer, _encoding, callback) {
      if (skippedMs < offsetMs) {
        skippedMs += opusPacketDurationMs(packet);
        callback();
        return;
      }
      callback(null, packet);
    },
  });
}

/**
 * Turns a WebM/Opus stream into Opus packets that start `offsetSeconds` into the track.
 * The audio is read from the start and the earlier packets are dropped without decoding,
 * which is fast because the direct link downloads much faster than real time.
 */
export function createSeekedOpusStream(webm: Readable, offsetSeconds: number): Readable {
  const skipper = skipOpusPackets(offsetSeconds * 1000);

  pipeline(webm, new prism.opus.WebmDemuxer(), skipper, (error) => {
    // Stopping or skipping the track destroys the stream early; that is not a failure.
    if (error && error.code !== "ERR_STREAM_PREMATURE_CLOSE") {
      logger.error("Seeked audio stream failed", { offsetSeconds }, error);
    }
  });

  return skipper;
}
