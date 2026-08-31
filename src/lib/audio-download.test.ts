import assert from "node:assert/strict";
import test from "node:test";
import { downloadFileName, encodeWavSelection } from "./audio-download";

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
    "patience-lead-guitar-guitar-solo.wav",
  );
});
