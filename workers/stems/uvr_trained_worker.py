"""UVR-compatible pretrained separation through audio-separator 0.48.0.

Same flow as UVR: the whole track goes through the model in one call, and the
library does its own overlapping windows (MDX) or segments (Demucs). No model
simulation or silent fallback. Model files are cached separately from audio
jobs. The Node bridge owns the overall timeout and process-group cleanup.
"""
from __future__ import annotations

import argparse
import logging
import shutil
from pathlib import Path

import onnxruntime as ort
import soundfile as sf
import torch
from tqdm import tqdm

from audio_separator.separator import Separator
from audio_separator.separator.architectures import mdx_separator
from uvr_audio import require_aligned, subtract, unit_peak
from uvr_worker import convert


MDX_MODEL = "UVR-MDX-NET-Voc_FT.onnx"
DEMUCS_MODEL = "htdemucs.yaml"
ENSEMBLE_WEIGHTS = [0.6, 0.4]
SAMPLE_RATE = 44100


def limit_onnx_threads(threads: int) -> None:
    """audio-separator builds its ONNX session with no thread limit, so it would
    use every host core and ignore the container quota (torch has its own knob).
    """
    session_options = ort.SessionOptions

    def limited() -> ort.SessionOptions:
        options = session_options()
        options.intra_op_num_threads = threads
        options.inter_op_num_threads = 1
        return options

    ort.SessionOptions = limited


def report_mdx_progress(logger: logging.Logger, share: float) -> None:
    """Turn the MDX window loop's tqdm bar into 'Progression' lines for the bridge.

    `share` is the part of the whole job this model represents. The library
    runs a second, model-free pass after the first; it never exceeds the last
    percentage, so it prints nothing.
    """
    last = -1

    class ProgressBar(tqdm):
        def update(self, n: float | None = 1) -> bool | None:
            nonlocal last
            result = super().update(n)
            if self.total:
                percent = int(100 * share * min(self.n, self.total) / self.total)
                if percent > last:
                    last = percent
                    logger.info("Progression : %d.0 %%", percent)
            return result

    mdx_separator.tqdm = ProgressBar


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--cpu-threads", type=int, default=2)
    parser.add_argument("--bitrate", type=int, default=192)
    parser.add_argument("--ensemble", action="store_true")
    parser.add_argument("--model-dir", type=Path, required=True)
    args = parser.parse_args()
    if args.cpu_threads < 1 or not 32 <= args.bitrate <= 320:
        parser.error("Invalid thread count or MP3 bitrate")
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    logger = logging.getLogger("uvr_trained")
    torch.set_num_threads(args.cpu_threads)
    limit_onnx_threads(args.cpu_threads)
    report_mdx_progress(logger, 0.45 if args.ensemble else 0.9)
    args.output.mkdir(parents=True, exist_ok=True)
    source_wav = args.output / "source.wav"
    work_dir = args.output / "inference"
    work_dir.mkdir()
    try:
        convert(["-i", str(args.source), "-vn", "-ac", "2", "-ar", str(SAMPLE_RATE),
                 "-c:a", "pcm_f32le", "-threads", str(args.cpu_threads), str(source_wav)])
        # audio-separator's MDX path multiplies its stems by the INPUT peak but
        # only normalizes inputs above normalization_threshold, so any other
        # input comes back attenuated and leaks into the instrumental. A peak of
        # exactly 1.0 makes that factor 1; the original level returns in the MP3.
        peak = unit_peak(source_wav)
        frames = sf.info(source_wav).frames
        logger.info("Progression : 2.0 %")
        logger.info("Loading pretrained UVR model(s); first use may download weights")
        separator = Separator(
            model_file_dir=str(args.model_dir), output_dir=str(work_dir),
            output_format="WAV", use_soundfile=True, sample_rate=SAMPLE_RATE,
            # Ensembling is per stem name, and Demucs has four. Keep only the
            # vocals there and derive the instrumental below.
            output_single_stem="Vocals" if args.ensemble else None,
            normalization_threshold=1.0, amplification_threshold=0.0,
            mdx_params={"hop_length": 1024, "segment_size": 256,
                        "overlap": 0.25, "batch_size": 1, "enable_denoise": False},
            demucs_params={"segment_size": "Default", "shifts": 1,
                           "overlap": 0.25, "segments_enabled": True},
            ensemble_algorithm="avg_wave" if args.ensemble else None,
            ensemble_weights=ENSEMBLE_WEIGHTS if args.ensemble else None,
        )
        separator.load_model([MDX_MODEL, DEMUCS_MODEL] if args.ensemble else MDX_MODEL)
        outputs = separator.separate(
            str(source_wav), {"Vocals": "vocals", "Instrumental": "instrumental"})
        logger.info("Progression : 100.0 %")
        vocals = work_dir / "vocals.wav"
        instrumental = work_dir / "instrumental.wav"
        if args.ensemble:
            subtract(source_wav, vocals, instrumental)
        for stem, label in ((vocals, "vocals"), (instrumental, "instrumental")):
            if not stem.is_file():
                raise ValueError(f"UVR did not produce the {label} stem: {outputs}")
            require_aligned(stem, frames, f"UVR {label} stem")
        for stem, name in ((vocals, "vocals.mp3"), (instrumental, "no_vocals.mp3")):
            convert(["-i", str(stem), "-vn", "-af", f"volume={peak:.9g}",
                     "-c:a", "libmp3lame", "-b:a", f"{args.bitrate}k",
                     "-threads", str(args.cpu_threads), str(args.output / name)])
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)
        source_wav.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
