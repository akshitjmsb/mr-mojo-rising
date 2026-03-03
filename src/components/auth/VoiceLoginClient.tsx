"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type SpeechRecognitionResultLike = {
  0: {
    transcript: string;
  };
};

type SpeechRecognitionEventLike = {
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionErrorEventLike = {
  error: string;
  message?: string;
};

type BrowserSpeechRecognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type BrowserSpeechRecognitionCtor = new () => BrowserSpeechRecognition;
type VoiceCaptureState = {
  stream: MediaStream;
  audioContext: AudioContext;
  intervalId: number;
  accum: Float64Array;
  samples: number;
};

const FINGERPRINT_BINS = 64;
const FINGERPRINT_INTERVAL_MS = 80;
let lastAutoStartAt = 0;

function getSpeechRecognitionCtor(): BrowserSpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: BrowserSpeechRecognitionCtor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

function getVoiceErrorMessage(errorCode: string): string {
  if (errorCode === "not-allowed" || errorCode === "service-not-allowed") {
    return "Microphone access is blocked. Allow microphone access and try again.";
  }
  if (errorCode === "audio-capture") {
    return "No microphone was detected on this Mac.";
  }
  if (errorCode === "network") {
    return "Speech recognition network error. Try again.";
  }
  if (errorCode === "no-speech") {
    return "No speech detected. Speak the passphrase clearly and try again.";
  }
  return "Voice recognition failed. Try again.";
}

export default function VoiceLoginClient() {
  const router = useRouter();
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const captureRef = useRef<VoiceCaptureState | null>(null);
  const unlockInFlightRef = useRef(false);
  const [listening, setListening] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [heardText, setHeardText] = useState("");

  const stopVoiceCapture = useCallback(async (): Promise<number[] | null> => {
    const capture = captureRef.current;
    if (!capture) return null;

    captureRef.current = null;
    window.clearInterval(capture.intervalId);
    capture.stream.getTracks().forEach((track) => track.stop());
    await capture.audioContext.close().catch(() => undefined);

    if (capture.samples < 4) return null;

    const averaged = Array.from(capture.accum, (value) => value / capture.samples);
    const mean = averaged.reduce((sum, value) => sum + value, 0) / averaged.length;
    const centered = averaged.map((value) => value - mean);
    const magnitude = Math.sqrt(centered.reduce((sum, value) => sum + value * value, 0));

    if (!Number.isFinite(magnitude) || magnitude === 0) return null;

    return centered.map((value) => Number((value / magnitude).toFixed(6)));
  }, []);

  const startVoiceCapture = useCallback(async (): Promise<boolean> => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Microphone API is unavailable. Use Chrome or Edge on this Mac.");
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);

      const data = new Float32Array(analyser.frequencyBinCount);
      const accum = new Float64Array(FINGERPRINT_BINS);

      const state: VoiceCaptureState = {
        stream,
        audioContext,
        intervalId: window.setInterval(() => {
          analyser.getFloatFrequencyData(data);
          for (let i = 0; i < FINGERPRINT_BINS; i += 1) {
            const val = data[i];
            accum[i] += Number.isFinite(val) ? val : -120;
          }
          state.samples += 1;
        }, FINGERPRINT_INTERVAL_MS),
        accum,
        samples: 0,
      };

      captureRef.current = state;
      return true;
    } catch {
      setError("Microphone access is blocked. Allow microphone access and try again.");
      return false;
    }
  }, []);

  const startVoiceUnlock = useCallback(async () => {
    if (unlockInFlightRef.current || listening || verifying) return;
    unlockInFlightRef.current = true;
    setError("");
    setHeardText("");

    const RecognitionCtor = getSpeechRecognitionCtor();
    if (!RecognitionCtor) {
      setError("Voice unlock requires Chrome or Edge on this Mac.");
      unlockInFlightRef.current = false;
      return;
    }

    const captureStarted = await startVoiceCapture();
    if (!captureStarted) {
      unlockInFlightRef.current = false;
      return;
    }

    const recognition = new RecognitionCtor();
    recognitionRef.current = recognition;
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = async (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim() || "";
      setHeardText(transcript);
      setListening(false);
      setVerifying(true);

      try {
        const voiceprint = await stopVoiceCapture();
        if (!voiceprint) {
          setError("Could not capture enough voice data. Try again.");
          setVerifying(false);
          unlockInFlightRef.current = false;
          return;
        }

        const res = await fetch("/api/auth/voice/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript, voiceprint }),
        });
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Voice authentication failed");
          setVerifying(false);
          unlockInFlightRef.current = false;
          return;
        }

        router.push("/");
        router.refresh();
      } catch {
        setError("Could not reach the server. Try again.");
        setVerifying(false);
        unlockInFlightRef.current = false;
      }
    };

    recognition.onerror = (event) => {
      void stopVoiceCapture();
      setError(getVoiceErrorMessage(event.error));
      setListening(false);
      setVerifying(false);
      unlockInFlightRef.current = false;
    };

    recognition.onend = () => {
      setListening(false);
    };

    try {
      setListening(true);
      recognition.start();
    } catch {
      void stopVoiceCapture();
      setListening(false);
      setError("Unable to start voice recognition. Try again.");
      unlockInFlightRef.current = false;
    }
  }, [listening, router, startVoiceCapture, stopVoiceCapture, verifying]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      void stopVoiceCapture();
      unlockInFlightRef.current = false;
    };
  }, [stopVoiceCapture]);

  useEffect(() => {
    const now = Date.now();
    if (now - lastAutoStartAt < 1500) return;
    lastAutoStartAt = now;
    const timer = window.setTimeout(() => {
      void startVoiceUnlock();
    }, 120);
    return () => window.clearTimeout(timer);
  }, [startVoiceUnlock]);

  return (
    <div
      style={{
        maxWidth: 420,
        margin: "0 auto",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: 24,
        position: "relative",
        zIndex: 1,
      }}
    >
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <h1
          className="flicker"
          style={{
            fontFamily: "var(--font-playfair), Georgia, serif",
            fontSize: 32,
            fontWeight: 900,
            fontStyle: "italic",
            letterSpacing: "-0.01em",
            lineHeight: 1,
            color: "var(--color-text)",
          }}
        >
          Mr. Mojo Rising
        </h1>
        <p
          style={{
            fontFamily: "var(--font-josefin), sans-serif",
            fontSize: 11,
            fontWeight: 300,
            letterSpacing: "0.28em",
            textTransform: "uppercase",
            color: "var(--color-gold)",
            marginTop: 8,
          }}
        >
          Guitar Practice Studio
        </p>
      </div>

      <div style={{ textAlign: "center" }}>
        <p
          style={{
            fontFamily: "var(--font-playfair), Georgia, serif",
            fontSize: 20,
            fontWeight: 700,
            fontStyle: "italic",
            color: "var(--color-text)",
            marginBottom: 12,
          }}
        >
          Voice Unlock
        </p>
        <p
          style={{
            fontFamily: "var(--font-josefin), sans-serif",
            fontSize: 13,
            fontWeight: 300,
            letterSpacing: "0.08em",
            lineHeight: 1.8,
            color: "var(--color-text-muted)",
            marginBottom: 20,
          }}
        >
          Speak your passphrase to unlock this app.
          <br />
          Listening starts automatically. Voice and phrase must match.
        </p>
        <button
          type="button"
          onClick={startVoiceUnlock}
          disabled={listening || verifying}
          style={{
            fontFamily: "var(--font-josefin), sans-serif",
            fontSize: 11,
            fontWeight: 400,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            padding: "14px 24px",
            background: "transparent",
            border: "1px solid var(--color-gold)",
            color: "var(--color-gold)",
            cursor: listening || verifying ? "default" : "pointer",
            opacity: listening || verifying ? 0.5 : 1,
            transition: "background 0.25s, opacity 0.25s",
            width: "100%",
          }}
        >
          {listening ? "Listening..." : verifying ? "Verifying..." : "Start Voice Unlock"}
        </button>

        {heardText && (
          <p
            style={{
              fontFamily: "var(--font-josefin), sans-serif",
              fontSize: 11,
              fontWeight: 300,
              letterSpacing: "0.06em",
              color: "var(--color-text-muted)",
              marginTop: 14,
            }}
          >
            Heard: &quot;{heardText}&quot;
          </p>
        )}

        {error && (
          <p
            style={{
              fontFamily: "var(--font-josefin), sans-serif",
              fontSize: 12,
              fontWeight: 400,
              color: "var(--color-terracotta)",
              letterSpacing: "0.06em",
              marginTop: 14,
            }}
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
