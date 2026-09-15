import unittest
from lyrics_align import CatalogLine, HeardWord, _normalize
from lyric_occurrences import recover_occurrences

class OccurrenceTests(unittest.TestCase):
    def test_recovers_repeat_missing_from_catalog(self):
        lines=[CatalogLine(0,"come here"),CatalogLine(4,"stay now")]
        heard=[HeardWord(t,t,i,i+.5,.9) for i,t in enumerate("come here stay now come here stay now".split())]
        result=recover_occurrences(lines,heard,_normalize)
        self.assertEqual([r["text"] for r in result],["come here","stay now"]*2)
        self.assertEqual([r["start"] for r in result],[0,2,4,6])

    def test_unrelated_words_do_not_create_lyric(self):
        result=recover_occurrences([CatalogLine(0,"come here")],[HeardWord("music","music",1,2,.9)],_normalize)
        self.assertEqual(result,[])

if __name__=="__main__":
    unittest.main()
