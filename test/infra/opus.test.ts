import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { test } from "node:test";
import { opusPacketDurationMs, skipOpusPackets } from "../../src/infra/opus.js";

// Table-of-contents byte: configuration in the top 5 bits, frame count code in the low 2.
function packet(config: number, frameCountCode = 0, ...rest: number[]): Buffer {
  return Buffer.from([(config << 3) | frameCountCode, ...rest]);
}

test("opusPacketDurationMs reads the frame size of each Opus mode", () => {
  // CELT 20 ms, as YouTube's Opus audio uses.
  assert.equal(opusPacketDurationMs(packet(31)), 20);
  assert.equal(opusPacketDurationMs(packet(16)), 2.5);
  // SILK 60 ms and hybrid 10 ms.
  assert.equal(opusPacketDurationMs(packet(3)), 60);
  assert.equal(opusPacketDurationMs(packet(12)), 10);
});

test("opusPacketDurationMs counts the frames in a packet", () => {
  assert.equal(opusPacketDurationMs(packet(31, 1)), 40);
  assert.equal(opusPacketDurationMs(packet(31, 2)), 40);
  // Code 3 stores the frame count in the next byte.
  assert.equal(opusPacketDurationMs(packet(31, 3, 0b1000_0011)), 60);
  assert.equal(opusPacketDurationMs(Buffer.alloc(0)), 0);
});

test("skipOpusPackets drops packets until the offset and keeps the rest", async () => {
  const packets = Array.from({ length: 10 }, (_, index) => packet(31, 0, index));
  const kept: Buffer[] = [];

  for await (const chunk of Readable.from(packets).pipe(skipOpusPackets(60))) {
    kept.push(chunk);
  }

  // 60 ms of 20 ms packets is three packets.
  assert.deepEqual(kept.map((chunk) => chunk[1]), [3, 4, 5, 6, 7, 8, 9]);
});
