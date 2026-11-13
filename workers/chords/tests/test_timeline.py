import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from timeline import align_timeline, chord_label


class TimelineTests(unittest.TestCase):
    def test_snaps_only_nearby_changes_and_preserves_end(self):
        cues = align_timeline([(0, "C"), (0.1, "C"), (0.96, "G"), (1.5, "Am")], 2.4, [0, 1, 2])
        self.assertEqual(cues, [
            {"start": 0, "end": 1, "chord": "C"},
            {"start": 1, "end": 1.5, "chord": "G"},
            {"start": 1.5, "end": 2.4, "chord": "Am"},
        ])

    def test_no_beats_preserves_original_timing(self):
        self.assertEqual(align_timeline([(0, "N"), (0.3, "C")], 1, [])[0]["end"], 0.3)

    def test_large_vocabulary_mapping(self):
        self.assertEqual(chord_label(0), "Cm")
        self.assertEqual(chord_label(1), "C")
        self.assertEqual(chord_label(14 + 8), "C#maj7")
        self.assertEqual(chord_label(168), "X")
        self.assertEqual(chord_label(169), "N")

    def test_close_changes_never_produce_negative_intervals(self):
        cues = align_timeline([(0, "C"), (.95, "G"), (1.05, "Am")], 2, [1])
        self.assertTrue(all(cue["end"] > cue["start"] for cue in cues))


if __name__ == "__main__":
    unittest.main()
