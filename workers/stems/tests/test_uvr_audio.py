from pathlib import Path
import sys
import tempfile
import unittest

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import uvr_audio
from uvr_audio import apply_gain, peak_of, require_aligned, subtract, unit_peak


def write_float(path: Path, data: np.ndarray) -> None:
    sf.write(path, data.astype(np.float32), 44100, subtype="FLOAT")


class UvrAudioTest(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        # Longer than several blocks so the streaming loops cross boundaries.
        uvr_audio.BLOCK_FRAMES = 1000
        self.addCleanup(setattr, uvr_audio, "BLOCK_FRAMES", 1 << 18)
        rng = np.random.default_rng(1)
        self.audio = (rng.standard_normal((4321, 2)) * 0.1).astype(np.float32)
        self.audio[3000, 1] = -0.5

    def test_peak_covers_every_channel_and_block(self) -> None:
        path = self.root / "a.wav"
        write_float(path, self.audio)
        self.assertAlmostEqual(peak_of(path), 0.5, places=6)

    def test_unit_peak_scales_in_place_and_returns_original_peak(self) -> None:
        path = self.root / "a.wav"
        write_float(path, self.audio)
        original = unit_peak(path)
        self.assertAlmostEqual(original, 0.5, places=6)
        scaled, _ = sf.read(path, dtype="float32")
        self.assertEqual(scaled.shape, self.audio.shape)
        self.assertAlmostEqual(float(np.abs(scaled).max()), 1.0, places=6)
        np.testing.assert_allclose(scaled * original, self.audio, atol=1e-6)

    def test_unit_peak_leaves_silence_untouched(self) -> None:
        path = self.root / "silent.wav"
        write_float(path, np.zeros((2500, 2)))
        self.assertEqual(unit_peak(path), 1.0)
        self.assertEqual(float(np.abs(sf.read(path)[0]).max()), 0.0)

    def test_unit_peak_handles_wav_with_text_chunk(self) -> None:
        # ffmpeg writes a LIST/INFO chunk; libsndfile rejects r+ mode on it.
        path = self.root / "tagged.wav"
        with sf.SoundFile(path, "w", samplerate=44100, channels=2, format="WAV", subtype="FLOAT") as tagged:
            tagged.title = "Lavf"
            tagged.write(self.audio)
        self.assertAlmostEqual(unit_peak(path), 0.5, places=6)
        self.assertAlmostEqual(peak_of(path), 1.0, places=6)
        self.assertEqual([p.name for p in self.root.iterdir()], ["tagged.wav"])

    def test_apply_gain_keeps_length(self) -> None:
        path = self.root / "a.wav"
        write_float(path, self.audio)
        apply_gain(path, 2.0)
        scaled, _ = sf.read(path, dtype="float32")
        np.testing.assert_allclose(scaled, self.audio * 2, atol=1e-6)

    def test_subtract_is_exact_and_streamed(self) -> None:
        mix, stem, out = (self.root / name for name in ("mix.wav", "stem.wav", "out.wav"))
        write_float(mix, self.audio)
        write_float(stem, self.audio * 0.25)
        subtract(mix, stem, out)
        result, rate = sf.read(out, dtype="float32")
        self.assertEqual(rate, 44100)
        np.testing.assert_allclose(result, self.audio * 0.75, atol=1e-7)

    def test_subtract_rejects_misaligned_stem(self) -> None:
        mix, stem = self.root / "mix.wav", self.root / "stem.wav"
        write_float(mix, self.audio)
        write_float(stem, self.audio[:-1])
        with self.assertRaisesRegex(ValueError, "sample-aligned"):
            subtract(mix, stem, self.root / "out.wav")

    def test_require_aligned(self) -> None:
        path = self.root / "a.wav"
        write_float(path, self.audio)
        require_aligned(path, len(self.audio), "stem")
        with self.assertRaisesRegex(ValueError, "stem has 4321 frames"):
            require_aligned(path, 4320, "stem")


if __name__ == "__main__":
    unittest.main()
