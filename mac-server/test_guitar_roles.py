import tempfile
import unittest
from pathlib import Path

import numpy as np
import soundfile as sf

from guitar_roles import classify_guitar_roles, render_guitar_role_focus


class GuitarRoleTests(unittest.TestCase):
    def test_classifier_keeps_melody_and_rejects_chord_stacks(self):
        notes = []
        for index in range(16):
            notes.append(
                {
                    "start": index * 0.5,
                    "duration": 0.28,
                    "pitch": 67 + index % 5,
                    "confidence": 0.9,
                    "string_num": 1,
                    "fret": 3 + index % 5,
                }
            )
        for index in range(12):
            start = index * 0.65 + 0.2
            for pitch in (43, 50, 55):
                notes.append(
                    {
                        "start": start,
                        "duration": 0.45,
                        "pitch": pitch,
                        "confidence": 0.85,
                        "string_num": 6,
                        "fret": 3,
                    }
                )

        annotated, report = classify_guitar_roles(notes, 10.0)
        melodic = [note for note in annotated if note["pitch"] >= 67]
        chords = [note for note in annotated if note["pitch"] <= 55]

        self.assertTrue(report["passed"])
        self.assertGreaterEqual(report["lead_note_count"], 12)
        self.assertGreaterEqual(
            sum(note["role"] == "lead" for note in melodic),
            int(len(melodic) * 0.75),
        )
        self.assertTrue(all(note["role"] == "rhythm" for note in chords))

    def test_classifier_withholds_roles_without_enough_evidence(self):
        notes = [
            {
                "start": 0.0,
                "duration": 0.2,
                "pitch": 64,
                "confidence": 0.9,
                "string_num": 1,
                "fret": 0,
            }
        ]

        annotated, report = classify_guitar_roles(notes, 5.0)

        self.assertFalse(report["passed"])
        self.assertEqual(annotated[0]["role"], "unknown")

    def test_role_audio_pushes_lead_and_rhythm_in_opposite_directions(self):
        sample_rate = 8000
        duration = 3.0
        time = np.arange(int(sample_rate * duration)) / sample_rate
        rhythm = 0.16 * np.sin(2 * np.pi * 165 * time)
        lead = 0.12 * np.sin(2 * np.pi * 659.25 * time)
        guitar = (rhythm + lead).astype(np.float32)
        notes = [
            {
                "start": start,
                "duration": 0.55,
                "pitch": 76,
                "confidence": 0.9,
                "role": "lead",
                "role_confidence": 0.9,
            }
            for start in np.arange(0.0, duration, 0.5)
        ]

        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            guitar_path = root / "guitar.wav"
            lead_path = root / "lead.wav"
            rhythm_path = root / "rhythm.wav"
            sf.write(guitar_path, guitar, sample_rate)

            report = render_guitar_role_focus(
                guitar_path,
                notes,
                lead_path,
                rhythm_path,
                chunk_seconds=1.5,
                padding_seconds=0.25,
            )
            lead_focus, lead_rate = sf.read(lead_path, dtype="float32")
            rhythm_focus, rhythm_rate = sf.read(rhythm_path, dtype="float32")

            frequencies = np.fft.rfftfreq(len(guitar), 1 / sample_rate)
            lead_bin = int(np.argmin(np.abs(frequencies - 659.25)))
            rhythm_bin = int(np.argmin(np.abs(frequencies - 165.0)))
            lead_spectrum = np.abs(np.fft.rfft(lead_focus))
            rhythm_spectrum = np.abs(np.fft.rfft(rhythm_focus))
            lead_ratio = lead_spectrum[lead_bin] / lead_spectrum[rhythm_bin]
            rhythm_ratio = rhythm_spectrum[lead_bin] / rhythm_spectrum[rhythm_bin]

            self.assertTrue(report["passed"])
            self.assertEqual(lead_rate, sample_rate)
            self.assertEqual(rhythm_rate, sample_rate)
            self.assertEqual(len(lead_focus), len(guitar))
            self.assertEqual(len(rhythm_focus), len(guitar))
            self.assertGreater(lead_ratio, rhythm_ratio * 2)


if __name__ == "__main__":
    unittest.main()
