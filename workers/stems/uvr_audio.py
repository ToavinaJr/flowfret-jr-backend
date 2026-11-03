"""Streaming WAV helpers for the UVR worker (numpy + soundfile only).

Every helper walks the file in blocks, so memory does not grow with duration.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import soundfile as sf

BLOCK_FRAMES = 1 << 18


def peak_of(path: Path) -> float:
    """Largest absolute sample over all channels; 0.0 for an empty file."""
    with sf.SoundFile(path) as reader:
        return max(
            (float(np.abs(block).max()) for block in
             reader.blocks(blocksize=BLOCK_FRAMES, dtype="float32", always_2d=True)),
            default=0.0,
        )


def apply_gain(path: Path, gain: float) -> None:
    """Scale a float WAV in place."""
    with sf.SoundFile(path, "r+") as audio:
        while True:
            start = audio.tell()
            block = audio.read(BLOCK_FRAMES, dtype="float32", always_2d=True)
            if not len(block):
                return
            audio.seek(start)
            audio.write(block * np.float32(gain))


def unit_peak(path: Path) -> float:
    """Scale a float WAV to a peak of 1.0 and return its original peak.

    A silent file is left untouched and reports 1.0, so the caller can restore
    the gain unconditionally.
    """
    peak = peak_of(path)
    if peak <= 0:
        return 1.0
    apply_gain(path, 1.0 / peak)
    return peak


def require_aligned(path: Path, frames: int, label: str) -> None:
    info = sf.info(path)
    if info.frames != frames:
        raise ValueError(f"{label} has {info.frames} frames, expected {frames}")


def subtract(mix_path: Path, stem_path: Path, output_path: Path) -> None:
    """Write mix - stem as a float WAV; both inputs must be sample-aligned."""
    with sf.SoundFile(mix_path) as mix, sf.SoundFile(stem_path) as stem:
        if (mix.samplerate, mix.channels, mix.frames) != (stem.samplerate, stem.channels, stem.frames):
            raise ValueError("Stem is not sample-aligned with the input")
        with sf.SoundFile(output_path, "w", samplerate=mix.samplerate, channels=mix.channels,
                          format="WAV", subtype="FLOAT") as output:
            while True:
                chunk = mix.read(BLOCK_FRAMES, dtype="float32", always_2d=True)
                if not len(chunk):
                    return
                output.write(chunk - stem.read(len(chunk), dtype="float32", always_2d=True))
