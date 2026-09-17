import assert from "node:assert/strict";
import test from "node:test";
import { downloadFileName, encodeWavSelection, encodeMp3Selection, mixDecodedAudio } from "./audio-download";

test("mix preserves timing and leaves headroom for two tracks", () => {
  const make = (samples: number[]) => ({ sampleRate: 100, numberOfChannels: 1,
    length: samples.length, getChannelData: () => Float32Array.from(samples) });
  const mixed = mixDecodedAudio([make([1, 0, 0.5]), make([1, 0.5, 0])]);
  assert.deepEqual([...mixed.getChannelData(0)], [1, 0.25, 0.25]);
  assert.throws(() => mixDecodedAudio([make([1]), { ...make([1]), sampleRate: 200 }]), /aligned/);
});

test("encodes only the requested sample range as PCM WAV", () => {
  const left = Float32Array.from([-1, -0.5, 0, 0.5, 1]);
  const right = Float32Array.from([1, 0.5, 0, -0.5, -1]);
  const wav = encodeWavSelection(
    {
      sampleRate: 2,
      numberOfChannels: 2,
      length: 5,
      getChannelData: (channel) => (channel === 0 ? left : right),
    },
    0.5,
    1.5,
  );
  const view = new DataView(wav);

  assert.equal(wav.byteLength, 52);
  assert.equal(view.getUint32(24, true), 2);
  assert.equal(view.getUint16(22, true), 2);
  assert.equal(view.getUint32(40, true), 8);
  assert.equal(view.getInt16(44, true), -16384);
  assert.equal(view.getInt16(46, true), 16384);
  assert.equal(view.getInt16(48, true), 0);
  assert.equal(view.getInt16(50, true), 0);
});

test("creates a readable selection filename", () => {
  assert.equal(
    downloadFileName("Patience", "Lead Guitar", "Guitar Solo"),
    "patience-lead-guitar-guitar-solo.mp3",
  );
});

test("MP3 export produces real 320 kbps MPEG frames for mono and stereo selections", async () => {
  for (const numberOfChannels of [1, 2]) {
    const sampleRate = 44100;
    const data = Float32Array.from({ length: sampleRate * 3 }, (_, i) => Math.sin(2 * Math.PI * 440 * i / sampleRate) * .2);
    const audio = { sampleRate, numberOfChannels, length: data.length, getChannelData: () => data };
    const blob = await encodeMp3Selection(audio, 1, 2);
    assert.equal(blob.type, "audio/mpeg");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    assert.equal(bytes[0], 0xff);
    assert.equal(bytes[1] & 0xe0, 0xe0);
    assert.equal(bytes[2] >> 4, 14); // MPEG-1 Layer III bitrate index 14 = 320 kbps.
    assert.ok(blob.size > 39000 && blob.size < 44000, `one second, not full track: ${blob.size}`);
    await assert.rejects(encodeMp3Selection(audio, 2, 1), /valid/);
    await assert.rejects(encodeMp3Selection(audio, 5, 6), /no audio/);
    await assert.rejects(encodeMp3Selection(audio, NaN, 1), /valid/);
  }
});
