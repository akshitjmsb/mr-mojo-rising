import sqlite3
import tempfile
import unittest
from unittest.mock import patch
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from lesson_engine import check_evidence, chapter_plan, extract, free_resources, validate_section, youtube_url
from lesson_models import Chord, Evidence, Fact, Metadata, Phrase, Plan, PlanSection, Resource, Section, Source
from lesson_worker import LocalDB, claim, ensure_schema, recover


def fact(value=None): return Fact(value=value, evidence=[], review=None)
def evidence(text, kind="transcript", at=None): return Evidence(kind=kind, at=at, detail=text)


class GroundingTests(unittest.TestCase):
    def test_checkpoints_resume_completed_sections(self):
        source = Source(url=None, title="Test", channel=None, duration=None, captions="Pasted")
        metadata = Metadata(**{k: fact() for k in ["song", "artist", "tuning", "capo", "key", "level", "gear"]})
        plan = Plan(metadata=metadata, sections=[PlanSection(title="One", start=None, end=None, frames=[])], songMap=fact(), resources=[])
        section = Section(title="One", start=None, end=None, chords=[], strumming=fact(), picking=fact(), phrases=[], tips=[])
        with tempfile.TemporaryDirectory() as cache, patch.dict('os.environ', {"LESSON_CACHE_DIR": cache}), patch('lesson_engine.source_material', return_value=(source, "Source text", "", None, [])), patch('lesson_engine.model_call', side_effect=[plan, section, section]) as model:
            first = extract(None, "Source text")
            second = extract(None, "Source text")
            self.assertEqual(model.call_count, 3)
            self.assertEqual(first.model_dump(), second.model_dump())

    def test_publisher_chapters_override_model_fragmentation(self):
        metadata = Metadata(**{k: fact() for k in ["song", "artist", "tuning", "capo", "key", "level", "gear"]})
        plan = Plan(metadata=metadata, sections=[PlanSection(title="Guessed chapter", start=0.0, end=600.0, frames=[12.0])], songMap=fact(), resources=[])
        result = chapter_plan(plan, [{"title":"Intro", "start_time":0, "end_time":60}, {"title":"Solo", "start_time":60, "end_time":600}], 600)
        self.assertEqual([s.start for s in result], [0,60,330])
        self.assertEqual(result[-1].end,600)

    def test_unmatched_claim_is_withheld(self):
        value = fact("C major"); value.evidence = [evidence("Use C major")]
        check_evidence(value, "Use C minor", "", [], 200)
        self.assertIsNone(value.value)
        self.assertIn("withheld", value.review)

    def test_chord_name_is_not_permission_to_invent(self):
        chord = Chord(name="C", frets=["0", "1", "0", "2", "3", "x"], evidence=[], review=None)
        check_evidence(chord, "C chord", "", [], 200)
        self.assertEqual(chord.frets, [None] * 6)

    def test_unseen_frames_and_audio_are_rejected(self):
        phrase = Phrase(title="Intro", start=10.0, end=20.0, notes=[], evidence=[evidence("diagram", "visual", 9.0), evidence("heard it", "audio", 10.0)], review=None)
        check_evidence(phrase, "", "", [10.0], 200)
        self.assertEqual(phrase.evidence, [])
        self.assertIn("Audio", phrase.review)

    def test_exact_variation_survives(self):
        chord = Chord(name="D5", frets=["x", "3", "2", "0", "x", "x"], evidence=[evidence("open fourth string, second fret third string, third fret second string")], review=None)
        check_evidence(chord, "Use open fourth string, second fret third string, third fret second string.", "", [], 200)
        self.assertEqual(chord.frets, ["x", "3", "2", "0", "x", "x"])

    def test_pasted_transcript_cannot_gain_timing(self):
        section = Section(title="Intro", start=0.0, end=50.0, chords=[], strumming=fact(), picking=fact(), tips=[], phrases=[Phrase(title="riff", start=20.0, end=25.0, notes=[], evidence=[], review=None)])
        validate_section(section, "untimed text", "", [], None, False)
        self.assertIsNone(section.start)
        self.assertIsNone(section.phrases[0].end)

    def test_only_explicit_free_resource(self):
        description = "FREE guide https://example.com/free\nBuy tabs https://example.com/paid"
        resources = [Resource(title="Guide", url="https://example.com/free", evidence="FREE guide https://example.com/free"), Resource(title="Tabs", url="https://example.com/paid", evidence="Buy tabs https://example.com/paid"), Resource(title="Invented", url="https://example.com/fake", evidence="FREE guide https://example.com/fake")]
        self.assertEqual([r.title for r in free_resources(resources, description)], ["Guide"])

    def test_urls_cannot_target_arbitrary_hosts(self):
        for url in ["https://127.0.0.1/watch?v=WHujjJEnZpI", "file:///tmp/test", "https://youtube.com.evil.test/watch?v=WHujjJEnZpI", "https://user@youtube.com/watch?v=WHujjJEnZpI"]:
            with self.assertRaises(ValueError): youtube_url(url)
        self.assertEqual(youtube_url("https://youtu.be/WHujjJEnZpI?si=abc"), "https://www.youtube.com/watch?v=WHujjJEnZpI")


class QueueTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.db = LocalDB(str(Path(self.folder.name) / "test.db"))
        ensure_schema(self.db); ensure_schema(self.db)
        self.db.execute("INSERT INTO lessons(id,input_hash) VALUES('test','hash')")
    def tearDown(self): self.folder.cleanup()
    def test_only_one_worker_claims_a_job(self):
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda owner: claim(self.db, owner), ["one", "two"]))
        self.assertEqual(sum(result is not None for result in results), 1)
    def test_stale_recovery_and_attempt_limit(self):
        claim(self.db, "old")
        self.db.execute("UPDATE lessons SET heartbeat_at=unixepoch()-200")
        recover(self.db)
        self.assertEqual(self.db.execute("SELECT status FROM lessons")[0]["status"], "queued")
        claim(self.db, "new")
        self.db.execute("UPDATE lessons SET heartbeat_at=unixepoch()-200")
        recover(self.db)
        self.assertEqual(self.db.execute("SELECT status FROM lessons")[0]["status"], "failed")
    def test_stale_owner_cannot_publish(self):
        claim(self.db, "old")
        self.db.execute("UPDATE lessons SET heartbeat_at=unixepoch()-200")
        recover(self.db); claim(self.db, "new")
        self.db.execute("UPDATE lessons SET status='ready' WHERE id='test' AND locked_by='old'")
        self.assertEqual(self.db.execute("SELECT status FROM lessons")[0]["status"], "running")


if __name__ == "__main__": unittest.main()
