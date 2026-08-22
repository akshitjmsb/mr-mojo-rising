import unittest

from lyrics_align import (
    CatalogLine,
    HeardWord,
    align_word_sequences,
    build_enhanced_lrc,
    parse_catalog_lines,
    source_words,
    _mostly_latin,
)


class LyricsAlignTests(unittest.TestCase):
    def test_detects_romanized_lyrics(self):
        self.assertTrue(_mostly_latin("jaanay na koi pehchane na koi"))
        self.assertFalse(_mostly_latin("جانے نہ کوئی"))

    def test_parses_catalog_and_removes_existing_inline_tags(self):
        lines = parse_catalog_lines(
            {
                "synced_lrc": "[00:06.00]<00:06.00>Woh <00:06.40>Chali",
                "plain_text": None,
            }
        )
        self.assertEqual(lines, [CatalogLine(time=6.0, text="Woh Chali")])

    def test_aligns_repeated_words_monotonically(self):
        lines = [
            CatalogLine(2.0, "go now"),
            CatalogLine(8.0, "go now"),
        ]
        expected = source_words(lines)
        heard = [
            HeardWord("go", "go", 3.0, 3.2, 0.9),
            HeardWord("now", "now", 3.3, 3.6, 0.9),
            HeardWord("go", "go", 9.0, 9.2, 0.9),
            HeardWord("now", "now", 9.3, 9.6, 0.9),
        ]
        mapping = align_word_sequences(expected, heard)
        self.assertEqual([mapping[index][0] for index in range(4)], [0, 1, 2, 3])

    def test_builds_word_timed_lrc_from_local_audio_times(self):
        lines = [CatalogLine(2.0, "Woh Chali"), CatalogLine(5.0, "Dekho Gali")]
        expected = source_words(lines)
        heard = [
            HeardWord("Woh", "woh", 4.2, 4.5, 0.9),
            HeardWord("Chali", "chali", 4.6, 5.0, 0.9),
            HeardWord("Dekho", "dekho", 7.3, 7.6, 0.9),
            HeardWord("Gali", "gali", 7.8, 8.1, 0.9),
        ]
        mapping = align_word_sequences(expected, heard)
        enhanced, report = build_enhanced_lrc(lines, expected, heard, mapping)
        self.assertTrue(report.passed)
        self.assertIn("[00:04.200]<00:04.200>Woh <00:04.600>Chali", enhanced or "")
        self.assertIn("[00:07.300]<00:07.300>Dekho <00:07.800>Gali", enhanced or "")

    def test_withholds_low_coverage_alignment(self):
        lines = [CatalogLine(2.0, "one two three four five six")]
        expected = source_words(lines)
        heard = [HeardWord("one", "one", 4.2, 4.5, 0.9)]
        mapping = align_word_sequences(expected, heard)
        enhanced, report = build_enhanced_lrc(lines, expected, heard, mapping)
        self.assertFalse(report.passed)
        self.assertIsNone(enhanced)


if __name__ == "__main__":
    unittest.main()
