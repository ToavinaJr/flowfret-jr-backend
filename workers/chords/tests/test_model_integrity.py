import hashlib
import tempfile
import unittest
from pathlib import Path

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from model_integrity import verify_model


class ModelIntegrityTests(unittest.TestCase):
    def test_accepts_matching_sha256(self):
        with tempfile.TemporaryDirectory() as directory:
            model = Path(directory) / "weights.ckpt"
            model.write_bytes(b"trusted model bytes")

            verify_model(model, hashlib.sha256(model.read_bytes()).hexdigest())

    def test_rejects_modified_model(self):
        with tempfile.TemporaryDirectory() as directory:
            model = Path(directory) / "weights.ckpt"
            model.write_bytes(b"modified model bytes")

            with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
                verify_model(model, "0" * 64)


if __name__ == "__main__":
    unittest.main()
