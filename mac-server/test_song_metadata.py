import unittest
from song_metadata import clean_song_title


class SongMetadataTests(unittest.TestCase):
    def test_library_titles(self):
        cases = [
            ("Apun Bola Tu Meri Laila- 4K Video | Shah Rukh Khan", "Ishtar Music", "Apun Bola Tu Meri Laila"),
            ("Last Kiss (Official Audio)", "Pearl Jam", "Last Kiss"),
            ("Sun Re Sajania    HD Ali Zafar", "Peter rai", "Sun Re Sajania"),
            ("Neend Aati Nahin (Cover) | Zoe Viccaji with Imam Hamdani", "Zoe Viccaji", "Neend Aati Nahin"),
            ("Mere Gaon Aaoge by RAHGIR | मेरे गाँव आओगे - राहगीर | New original song", "Rahgir Live", "Mere Gaon Aaoge"),
            ("Guns N' Roses - Patience", "Guns N' Roses", "Patience"),
            ("Jaanay Na Koi - Ali Zafar", "Ali Zafar", "Jaanay Na Koi"),
            ("Sweet Child O' Mine", None, "Sweet Child O' Mine"),
            ("Song - Part Two", "Some Channel", "Song - Part Two"),
            ("Something (In the Way)", None, "Something (In the Way)"),
        ]
        for raw, artist, expected in cases:
            with self.subTest(raw=raw):
                self.assertEqual(clean_song_title(raw, artist)[0], expected)
