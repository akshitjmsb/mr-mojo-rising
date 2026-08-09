let context: AudioContext | null = null;
let activeSources: AudioBufferSourceNode[] = [];

type WebkitAudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

function audioContextConstructor() {
  return window.AudioContext ?? (window as WebkitAudioWindow).webkitAudioContext;
}

async function getAudioContext() {
  const AudioContextClass = audioContextConstructor();
  if (!AudioContextClass) return null;
  if (!context || context.state === "closed") context = new AudioContextClass();
  if (context.state === "suspended") await context.resume();
  return context;
}

function createPluckedStringBuffer(
  audioContext: AudioContext,
  frequency: number,
  duration: number,
) {
  const sampleRate = audioContext.sampleRate;
  const frameCount = Math.ceil(sampleRate * duration);
  const buffer = audioContext.createBuffer(1, frameCount, sampleRate);
  const samples = buffer.getChannelData(0);
  const period = Math.max(2, Math.round(sampleRate / frequency));

  for (let index = 0; index < period; index++) {
    samples[index] = Math.random() * 2 - 1;
  }
  for (let index = period; index < frameCount; index++) {
    const previous = samples[index - period];
    const neighbour = samples[index - period + 1] ?? previous;
    samples[index] = (previous + neighbour) * 0.498;
  }

  return buffer;
}

function stopSources() {
  for (const source of activeSources) {
    try {
      source.stop();
    } catch {
      // A source that has already ended needs no cleanup.
    }
  }
  activeSources = [];
}

async function playFrequencies(frequencies: number[], strumDelay: number) {
  const audioContext = await getAudioContext();
  if (!audioContext || frequencies.length === 0) return;
  stopSources();

  const compressor = audioContext.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.knee.value = 12;
  compressor.ratio.value = 5;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.22;

  const master = audioContext.createGain();
  master.gain.value = frequencies.length === 1 ? 0.62 : 0.46;
  master.connect(compressor);
  compressor.connect(audioContext.destination);

  const start = audioContext.currentTime + 0.015;
  activeSources = frequencies.map((frequency, index) => {
    const source = audioContext.createBufferSource();
    const tone = audioContext.createBiquadFilter();
    const gain = audioContext.createGain();
    const beginsAt = start + index * strumDelay;
    const duration = frequencies.length === 1 ? 1.8 : 2.2;

    source.buffer = createPluckedStringBuffer(audioContext, frequency, duration);
    tone.type = "lowpass";
    tone.frequency.value = 2600;
    tone.Q.value = 0.45;
    gain.gain.setValueAtTime(0.001, beginsAt);
    gain.gain.exponentialRampToValueAtTime(0.9, beginsAt + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, beginsAt + duration);

    source.connect(tone);
    tone.connect(gain);
    gain.connect(master);
    source.start(beginsAt);
    source.stop(beginsAt + duration);
    return source;
  });
}

export function midiToReferenceFrequency(midi: number) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function playReferenceNote(frequency: number) {
  return playFrequencies([frequency], 0);
}

export function playReferenceChord(midiNotes: number[]) {
  return playFrequencies(midiNotes.map(midiToReferenceFrequency), 0.045);
}

export function stopReferenceAudio() {
  stopSources();
}
