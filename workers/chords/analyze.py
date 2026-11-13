"""CPU inference: BTC chord transformer plus Beat This! beat/downbeat transformer.

Model assets must be installed explicitly with setup_models.py; requests never download code.
"""
import argparse
import json
import sys
from pathlib import Path

from timeline import align_timeline, chord_label


def analyze(audio_path: Path, models: Path) -> dict:
    import librosa
    import numpy as np
    import torch
    from beat_this.inference import Audio2Beats

    torch.set_num_threads(2)
    sys.path.insert(0, str(models / "btc"))
    from btc_model import BTC_model

    audio, sample_rate = librosa.load(str(audio_path), sr=22050, mono=True, duration=901)
    duration = len(audio) / sample_rate
    if not 0 < duration <= 900 or not np.isfinite(audio).all():
        raise ValueError("Audio must be finite and shorter than 15 minutes")
    config = {
        "feature_size": 144, "timestep": 108, "num_chords": 170,
        "input_dropout": 0.2, "layer_dropout": 0.2, "attention_dropout": 0.2,
        "relu_dropout": 0.2, "num_layers": 8, "num_heads": 4,
        "hidden_size": 128, "total_key_depth": 128, "total_value_depth": 128,
        "filter_size": 128, "probs_out": False,
    }
    # This is a pinned upstream checkpoint installed by the operator, never an uploaded file.
    checkpoint = torch.load(models / "btc/test/btc_model_large_voca.pt", map_location="cpu", weights_only=False)
    model = BTC_model(config).cpu().eval()
    model.load_state_dict(checkpoint["model"])
    predictions = []
    with torch.inference_mode():
        for start in range(0, len(audio), sample_rate * 10):
            segment = audio[start:start + sample_rate * 10]
            segment_duration = len(segment) / sample_rate
            # BTC was trained on ten-second CQT patches of 108 frames.
            segment = np.pad(segment, (0, max(0, sample_rate * 10 - len(segment))))
            features = np.log(np.abs(librosa.cqt(segment, sr=sample_rate, n_bins=144, bins_per_octave=24, hop_length=2048)) + 1e-6).T
            features = (features - checkpoint["mean"]) / checkpoint["std"]
            features = torch.as_tensor(features[:108], dtype=torch.float32).unsqueeze(0)
            hidden, _ = model.self_attn_layers(features)
            labels, _ = model.output_layer(hidden)
            for index, label in enumerate(labels.reshape(-1).tolist()):
                offset = index * 10 / 108
                if offset < segment_duration:
                    predictions.append((start / sample_rate + offset, chord_label(label)))
    tracker = Audio2Beats(checkpoint_path=str(models / "beat-small0.ckpt"), device="cpu", dbn=False)
    beats, downbeats = tracker(audio, sample_rate)
    beats = sorted(set(float(time) for time in beats if 0 <= time <= duration))
    downbeats = sorted(set(float(time) for time in downbeats if 0 <= time <= duration))
    return {"duration": duration, "cues": align_timeline(predictions, duration, beats),
            "beats": beats, "downbeats": downbeats, "engineVersion": "btc-beat-this-v1"}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio", type=Path, required=True)
    parser.add_argument("--models", type=Path, required=True)
    args = parser.parse_args()
    # stdout is reserved for the JSON result consumed by the Nest bridge.
    from contextlib import redirect_stdout
    with redirect_stdout(sys.stderr):
        result = analyze(args.audio, args.models)
    sys.stdout.write(json.dumps(result, allow_nan=False))


if __name__ == "__main__":
    main()
