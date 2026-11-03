"""UVR-compatible pretrained separation through audio-separator 0.48.0.

Uses the public model loader and inference implementation derived from UVR.
No model simulation or silent fallback. Model files are cached separately from
audio jobs. The Node bridge owns the overall timeout and process-group cleanup.
"""
from __future__ import annotations

import argparse
import logging
from pathlib import Path

import numpy as np
import soundfile as sf
import torch

from audio_separator.separator import Separator
from uvr_worker import convert
from uvr_pipeline import VocalModel, WeightedEnsemble, PipelineConfig, separate_file


MDX_MODEL = "UVR-MDX-NET-Voc_FT.onnx"
DEMUCS_MODEL = "htdemucs.yaml"


class TrainedVocalModel(VocalModel):
    """Public file API adapter; hardware selection belongs to Separator.

    Our outer overlap-add avoids the library's optional coarse chunker, which
    concatenates chunks without a crossfade. Inner MDX windows still overlap.
    """

    def __init__(self, separator: Separator, work_dir: Path) -> None:
        super().__init__(torch.device("cpu"))
        self.separator = separator
        self.work_dir = work_dir

    def predict(self, audio: torch.Tensor, sample_rate: int) -> torch.Tensor:
        values = audio.cpu().numpy().T
        peak = float(np.abs(values).max())
        if peak < 1e-8:
            return torch.zeros_like(audio)
        source = self.work_dir / "chunk.wav"
        # UVR models expect normalized input. Restore this SAME gain afterward;
        # do not normalize each resulting source independently in our pipeline.
        sf.write(source, values / peak, sample_rate, subtype="FLOAT")
        outputs = self.separator.separate(str(source), {"Vocals": "trained-vocals"})
        if len(outputs) != 1:
            raise ValueError("UVR must return exactly one vocal stem")
        vocals = Path(outputs[0])
        if not vocals.is_absolute():
            vocals = self.work_dir / vocals
        if not vocals.is_file() or not vocals.resolve().is_relative_to(self.work_dir.resolve()):
            raise ValueError("UVR returned an invalid output path")
        prediction, rate = sf.read(vocals, dtype="float32", always_2d=True)
        if rate != sample_rate or prediction.shape != values.shape:
            raise ValueError("UVR output is not sample-aligned with the input")
        vocals.unlink()
        source.unlink()
        return torch.from_numpy(np.ascontiguousarray(prediction.T * peak))


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
    args.output.mkdir(parents=True, exist_ok=True)
    source_wav = args.output / "source.wav"
    convert(["-i", str(args.source), "-vn", "-ac", "2", "-ar", "44100",
             "-c:a", "pcm_f32le", "-threads", str(args.cpu_threads), str(source_wav)])
    logger.info("Loading pretrained UVR model(s); first use may download weights")
    work_dir = args.output / "inference"
    work_dir.mkdir()
    separator = Separator(
        model_file_dir=str(args.model_dir), output_dir=str(work_dir),
        output_format="WAV", output_single_stem="Vocals", use_soundfile=True,
        normalization_threshold=1.0, amplification_threshold=0.0,
        sample_rate=44100,
        mdx_params={"hop_length": 1024, "segment_size": 256,
                    "overlap": 0.25, "batch_size": 1, "enable_denoise": False},
        demucs_params={"segment_size": "Default", "shifts": 1,
                       "overlap": 0.25, "segments_enabled": True},
        ensemble_algorithm="avg_wave" if args.ensemble else None,
        ensemble_weights=[0.6, 0.4] if args.ensemble else None,
    )
    separator.load_model([MDX_MODEL, DEMUCS_MODEL] if args.ensemble else MDX_MODEL)
    logger.info("Progression : 10.0 %%")
    duration = sf.info(source_wav).duration
    vocals, backing = separate_file(
        source_wav, args.output,
        WeightedEnsemble([TrainedVocalModel(separator, work_dir)], [1]),
        PipelineConfig(window_size=min(30, duration), overlap=0 if duration <= 30 else 0.25), logger,
    )
    logger.info("Progression : 90.0 %%")
    for wav, name in ((vocals, "vocals.mp3"), (backing, "no_vocals.mp3")):
        convert(["-i", str(wav), "-vn", "-c:a", "libmp3lame",
                 "-b:a", f"{args.bitrate}k", "-threads", str(args.cpu_threads),
                 str(args.output / name)])
        wav.unlink()
    source_wav.unlink()


if __name__ == "__main__":
    main()
