export type DecodedAudio = {
  sampleRate: number;
  numberOfChannels: number;
  length: number;
  getChannelData(channel: number): Float32Array;
};

export function mixDecodedAudio(tracks: DecodedAudio[]): DecodedAudio {
  if (!tracks.length) throw new Error("No audio tracks available.");
  if (tracks.length === 1) return tracks[0];
  const sampleRate = tracks[0].sampleRate;
  if (tracks.some(track => track.sampleRate !== sampleRate || Math.abs(track.length - tracks[0].length) > sampleRate * 0.1)) {
    throw new Error("These tracks are not aligned; cannot download the mix.");
  }
  const length = Math.max(...tracks.map(track => track.length));
  const numberOfChannels = Math.max(...tracks.map(track => track.numberOfChannels));
  return { sampleRate, length, numberOfChannels, getChannelData(channel) {
    const output = new Float32Array(length);
    for (const track of tracks) {
      const input = track.getChannelData(Math.min(channel, track.numberOfChannels - 1));
      for (let i = 0; i < input.length; i++) output[i] += input[i] / tracks.length;
    }
    return output;
  }};
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function pcm16(sample: number) {
  const clamped = Math.max(-1, Math.min(1, sample));
  return clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767);
}

/** Encode an exact time slice as lossless PCM relative to the decoded source. */
export function encodeWavSelection(
  audio: DecodedAudio,
  startSeconds: number,
  endSeconds: number,
): ArrayBuffer {
  const startFrame = Math.max(
    0,
    Math.min(audio.length, Math.floor(startSeconds * audio.sampleRate)),
  );
  const endFrame = Math.max(
    startFrame,
    Math.min(audio.length, Math.ceil(endSeconds * audio.sampleRate)),
  );
  const frameCount = endFrame - startFrame;
  if (frameCount === 0 || audio.numberOfChannels === 0) {
    throw new Error("The selected section contains no audio.");
  }

  const channelCount = audio.numberOfChannels;
  const bytesPerSample = 2;
  const dataBytes = frameCount * channelCount * bytesPerSample;
  const output = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(output);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, audio.sampleRate, true);
  view.setUint32(
    28,
    audio.sampleRate * channelCount * bytesPerSample,
    true,
  );
  view.setUint16(32, channelCount * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);

  const channels = Array.from({ length: channelCount }, (_, channel) =>
    audio.getChannelData(channel),
  );
  let offset = 44;
  for (let frame = startFrame; frame < endFrame; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      view.setInt16(offset, pcm16(channels[channel][frame]), true);
      offset += bytesPerSample;
    }
  }

  return output;
}

export function downloadFileName(
  songTitle: string,
  pieceLabel: string,
  sectionLabel: string,
) {
  const slug = [songTitle, pieceLabel, sectionLabel]
    .map((part) =>
      part
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""),
    )
    .filter(Boolean)
    .join("-")
    .slice(0, 120);
  return `${slug || "song-selection"}.wav`;
}
