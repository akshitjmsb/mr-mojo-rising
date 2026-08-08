import unittest

from lyrics_fetch import last_lrc_timestamp, select_duration_matched_record


class LyricsFetchTests(unittest.TestCase):
    def test_prefers_matching_duration(self):
        records = [
            {
                "id": 1,
                "trackName": "Patience",
                "artistName": "Guns N' Roses",
                "duration": 391,
                "syncedLyrics": "[00:50.00] first\n[06:20.00] last",
            },
            {
                "id": 2,
                "trackName": "Patience",
                "artistName": "Guns N’ Roses",
                "duration": 356,
                "syncedLyrics": "[00:52.00] first\n[05:41.00] last",
            },
        ]
        selected = select_duration_matched_record(
            records,
            title="Patience",
            artist="Guns N' Roses",
            duration=356.28,
        )
        self.assertEqual(selected["id"], 2)

    def test_rejects_timestamps_beyond_audio(self):
        records = [
            {
                "id": 1,
                "trackName": "Patience",
                "artistName": "Guns N' Roses",
                "duration": 356,
                "syncedLyrics": "[00:52.00] first\n[06:10.00] last",
            }
        ]
        selected = select_duration_matched_record(
            records,
            title="Patience",
            artist="Guns N' Roses",
            duration=356.28,
        )
        self.assertIsNone(selected)

    def test_reads_last_timestamp(self):
        self.assertEqual(last_lrc_timestamp("[00:01.00] a\n[05:41.22] b"), 341.22)


if __name__ == "__main__":
    unittest.main()
