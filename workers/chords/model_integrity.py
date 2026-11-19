"""Pinned SHA-256 checks for downloaded chord-analysis model weights."""
import hashlib
from pathlib import Path

MODEL_SHA256 = {
    "beat-small0.ckpt": "6074be2c4d490c5f6101fcc374a1ec72ae93456e23bb6019783b849f5dc7d47b",
    "btc/test/btc_model_large_voca.pt": "1673d23f8f9a55ae7f9e8b80a51da616debb22675b8d8b67ea6ce0ef37b0ab51",
}


def verify_model(path: Path, expected_sha256: str) -> None:
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != expected_sha256:
        raise ValueError(f"Model SHA-256 mismatch: {path.name}")
