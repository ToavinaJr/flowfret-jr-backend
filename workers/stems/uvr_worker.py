"""Adapter from the FlowFret worker contract to the simulated UVR pipeline.

The parent supervises the total runtime and forwards progress. This subprocess
keeps torch imports out of the downloader and preserves the existing MP3 API.
"""
from __future__ import annotations

import argparse
import logging
import subprocess
from pathlib import Path

import torch

from uvr_pipeline import (
    PipelineConfig, SpectrogramDemo, WaveformDemo, WeightedEnsemble,
    detect_device, separate_file,
)


def convert(arguments: list[str]) -> None:
    result = subprocess.run(
        ["ffmpeg", "-nostdin", "-v", "error", *arguments],
        capture_output=True, text=True, timeout=60, check=False,
    )
    if result.returncode:
        raise RuntimeError(f"Audio conversion failed: {result.stderr[-2000:]}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--cpu-threads", type=int, default=2)
    parser.add_argument("--bitrate", type=int, default=192)
    args = parser.parse_args()
    if args.cpu_threads < 1 or not 32 <= args.bitrate <= 320:
        parser.error("Invalid thread count or MP3 bitrate")
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    logger = logging.getLogger("uvr_worker")
    torch.set_num_threads(args.cpu_threads)
    device = detect_device()
    logger.warning("SIMULATED UVR ensemble; no trained vocal model. Device: %s", device)
    args.output.mkdir(parents=True, exist_ok=True)
    source_wav = args.output / "source.wav"
    # Fix sample rate and channels for predictable window memory and playback.
    convert(["-i", str(args.source), "-vn", "-ac", "2", "-ar", "44100",
             "-c:a", "pcm_f32le", "-threads", str(args.cpu_threads), str(source_wav)])
    ensemble = WeightedEnsemble(
        [SpectrogramDemo(device), WaveformDemo(device)], [0.6, 0.4],
    )
    wavs = separate_file(source_wav, args.output, ensemble, PipelineConfig(), logger)
    for wav, name in zip(wavs, ("vocals.mp3", "no_vocals.mp3")):
        convert(["-i", str(wav), "-vn", "-c:a", "libmp3lame",
                 "-b:a", f"{args.bitrate}k", "-threads", str(args.cpu_threads),
                 str(args.output / name)])
        wav.unlink()
    source_wav.unlink()


if __name__ == "__main__":
    main()
