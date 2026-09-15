import unittest
import numpy as np
from repeat_timing import transfer_frame

class RepeatTimingTests(unittest.TestCase):
    def test_known_shift_round_trips(self):
        path=np.array([(i,i+12) for i in range(100)])
        result=transfer_frame(path,40)
        self.assertEqual(result["target_frame"],52)
        self.assertTrue(result["unambiguous"])

    def test_stretched_silence_is_not_a_precise_anchor(self):
        path=np.array([(40,j) for j in range(20,60)])
        result=transfer_frame(path,40)
        self.assertFalse(result["unambiguous"])

    def test_missing_path_is_not_interpolated(self):
        self.assertIsNone(transfer_frame(np.array([(0,0),(1,1)]),20))

if __name__=="__main__":
    unittest.main()
