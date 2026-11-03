"""Pipeline pédagogique inspiré des principes d'UVR, sans poids UVR.

Installation : pip install torch numpy soundfile
Usage : python uvr_pipeline.py chanson.wav --output-dir sorties

Les deux estimateurs sont des heuristiques de démonstration, PAS des réseaux
entraînés. Une voix et un instrument partageant les mêmes fréquences ne peuvent
pas être distingués par ces heuristiques. Remplacer VocalModel pour la production.
SoundFile assure les entrées/sorties WAV par blocs (PCM et flottant), sans charger
le morceau entier. RAM et VRAM de travail dépendent de window_size, pas de sa durée.
"""

from __future__ import annotations

import argparse
import logging
import math
import platform
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
import torch.nn.functional as F


def detect_device() -> torch.device:
    """Priorité CUDA NVIDIA, puis MPS sur macOS, puis CPU."""
    if torch.cuda.is_available():
        return torch.device("cuda")
    if platform.system() == "Darwin" and torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


@dataclass(frozen=True)
class PipelineConfig:
    window_size: float = 8.0  # secondes, pas nombre d'échantillons
    overlap: float = 0.5
    spectral_weight: float = 0.6
    temporal_weight: float = 0.4

    def validate(self) -> None:
        if not math.isfinite(self.window_size) or self.window_size <= 0:
            raise ValueError("window_size doit être fini et strictement positif.")
        # 1.0 est exclu : un chevauchement total donnerait un pas nul.
        if not math.isfinite(self.overlap) or not 0 <= self.overlap < 1:
            raise ValueError("overlap doit appartenir à [0, 1[.")
        weights = (self.spectral_weight, self.temporal_weight)
        if any(not math.isfinite(w) or w < 0 for w in weights):
            raise ValueError("Les poids doivent être finis et positifs ou nuls.")
        if not math.isfinite(sum(weights)) or sum(weights) <= 0:
            raise ValueError("La somme des poids doit être finie et > 0.")


class VocalModel(ABC):
    """Contrat pour un modèle spectral, temporel ou un adaptateur préentraîné.

    Entrée/sortie : float32 [canaux, échantillons], même taux, même gain,
    même longueur et alignement temporel. Un adaptateur réel doit charger ses
    poids dans __init__, appeler eval(), rééchantillonner si nécessaire et
    compenser toute latence avant de retourner sa prédiction vocale.
    """

    def __init__(self, device: torch.device) -> None:
        self.device = device

    @abstractmethod
    def predict(self, audio: torch.Tensor, sample_rate: int) -> torch.Tensor:
        """Retourner une estimation de la voix, sans normalisation indépendante."""
        raise NotImplementedError


class SpectrogramDemo(VocalModel):
    """Simulation MDX/VR : STFT -> masque fréquentiel -> ISTFT.

    Le masque favorise les composantes centrales entre environ 120 et 8000 Hz.
    Il retiendra aussi certains instruments : aucune reconnaissance de voix.
    """

    def __init__(self, device: torch.device, n_fft: int = 2048) -> None:
        # Repli explicite pour les FFT complexes sur les versions MPS dont les
        # opérateurs ne sont pas compatibles. Le modèle temporel utilise MPS.
        super().__init__(torch.device("cpu") if device.type == "mps" else device)
        if n_fft < 4 or n_fft % 4:
            raise ValueError("n_fft doit être un multiple de 4, au moins égal à 4.")
        self.n_fft = n_fft
        self.window = torch.hann_window(n_fft, device=self.device)

    def predict(self, audio: torch.Tensor, sample_rate: int) -> torch.Tensor:
        audio = audio.to(self.device)
        spectrum = torch.stft(
            audio, n_fft=self.n_fft, hop_length=self.n_fft // 4,
            window=self.window, center=True, pad_mode="constant",
            return_complex=True,
        )
        frequency = torch.fft.rfftfreq(
            self.n_fft, d=1.0 / sample_rate, device=self.device,
        )
        # Transitions douces pour limiter les oscillations d'un filtre abrupt.
        low_pass = 1 / (1 + (frequency / 8000).pow(8))
        high_pass = frequency.square() / (frequency.square() + 120**2)
        band = (low_pass * high_pass)[None, :, None]
        # |moyenne complexe| / moyenne(|spectres|) mesure la présence au centre.
        center = spectrum.mean(dim=0, keepdim=True)
        coherence = center.abs() / spectrum.abs().mean(dim=0, keepdim=True).clamp_min(1e-8)
        mask = band * coherence.clamp(0, 1)
        return torch.istft(
            spectrum * mask, n_fft=self.n_fft, hop_length=self.n_fft // 4,
            window=self.window, center=True, length=audio.shape[-1],
        )


class WaveformDemo(VocalModel):
    """Simulation d'un chemin temporel : filtre FIR directement sur l'onde.

    Ceci n'implémente pas le réseau Demucs. La moyenne des canaux privilégie
    le centre stéréo, puis deux moyennes glissantes forment un passe-bande.
    """

    def predict(self, audio: torch.Tensor, sample_rate: int) -> torch.Tensor:
        audio = audio.to(self.device)
        center = audio.mean(dim=0, keepdim=True).unsqueeze(0)

        def smooth(signal: torch.Tensor, milliseconds: float) -> torch.Tensor:
            size = max(3, round(sample_rate * milliseconds / 1000) | 1)
            # Noyau impair, padding symétrique : pas de décalage de phase global.
            padded = F.pad(signal, (size // 2, size // 2), mode="replicate")
            return F.avg_pool1d(padded, kernel_size=size, stride=1)

        vocal = smooth(center, 0.1) - smooth(center, 8.0)
        return vocal.squeeze(0).expand_as(audio)


class WeightedEnsemble:
    def __init__(self, models: list[VocalModel], weights: list[float]) -> None:
        if not models or len(models) != len(weights):
            raise ValueError("Fournir un poids par modèle et au moins un modèle.")
        total = sum(weights)
        if (any(not math.isfinite(w) or w < 0 for w in weights)
                or not math.isfinite(total) or total <= 0):
            raise ValueError("Poids invalides pour l'ensemble.")
        self.models = tuple(models)
        self.weights = tuple(w / total for w in weights)

    @torch.inference_mode()
    def predict(self, audio: np.ndarray, sample_rate: int) -> np.ndarray:
        tensor = torch.from_numpy(np.ascontiguousarray(audio.T))
        result = np.zeros_like(audio, dtype=np.float32)
        # Inférence séquentielle : pas deux graphes/activations sur le GPU.
        for model, weight in zip(self.models, self.weights):
            if weight == 0:
                continue
            prediction = model.predict(tensor, sample_rate)
            if prediction.shape != tensor.shape:
                raise ValueError("Le modèle a changé la longueur ou les canaux.")
            values = prediction.detach().cpu().numpy().T
            if not np.isfinite(values).all():
                raise ValueError("Prédiction contenant NaN ou Inf.")
            # v = somme(w_i * v_i) / somme(w_i), les poids sont déjà normalisés.
            result += weight * values
        return result


def synthesis_window(size: int, hop: int) -> np.ndarray:
    """Hann à mi-échantillon : poids > 0 même aux extrémités du fichier.

    Normaliser par la somme des poids permet aussi les overlaps autres que 50 %.
    Sans overlap, utiliser une fenêtre rectangulaire (pas de fondu possible).
    """
    if hop == size:
        return np.ones(size, dtype=np.float64)
    phase = (np.arange(size, dtype=np.float64) + 0.5) / size
    return np.sin(np.pi * phase) ** 2


def separate_file(
    source: Path, output_dir: Path, ensemble: WeightedEnsemble,
    config: PipelineConfig, logger: logging.Logger,
) -> tuple[Path, Path]:
    """Overlap-add en flux : seuls une fenêtre et les cumuls sont en mémoire.

    Les WAV FLOAT conservent les amplitudes sans écrêtage ni normalisation.
    L'instrumental vaut exactement x - v (à l'arrondi float32 près).
    Les fichiers existants sont protégés par le mode de création exclusif.
    """
    config.validate()
    vocals_path = output_dir / "output_vocals.wav"
    instrumental_path = output_dir / "output_instruments.wav"
    with sf.SoundFile(source) as reader:
        if reader.format not in ("WAV", "WAVEX", "RF64"):
            raise ValueError("L'entrée doit être un fichier WAV.")
        if reader.channels not in (1, 2) or reader.frames <= 0:
            raise ValueError("Fournir un WAV non vide, mono ou stéréo.")
        size = round(config.window_size * reader.samplerate)
        if size < 4:
            raise ValueError("window_size doit représenter au moins 4 échantillons.")
        hop = max(1, round(size * (1 - config.overlap)))
        window = synthesis_window(size, hop)
        accumulated = np.zeros((size, reader.channels), dtype=np.float64)
        normalization = np.zeros(size, dtype=np.float64)
        output_dir.mkdir(parents=True, exist_ok=True)
        created: list[Path] = []
        try:
            # Création exclusive : ne jamais écraser une entrée ou un résultat.
            with vocals_path.open("xb") as vocal_file:
                created.append(vocals_path)
                with instrumental_path.open("xb") as instrumental_file:
                    created.append(instrumental_path)
                    with sf.SoundFile(vocal_file, mode="w", samplerate=reader.samplerate,
                                      channels=reader.channels, format="WAV", subtype="FLOAT") as voice, \
                         sf.SoundFile(instrumental_file, mode="w", samplerate=reader.samplerate,
                                      channels=reader.channels, format="WAV", subtype="FLOAT") as backing:
                        for start in range(0, reader.frames, hop):
                            reader.seek(start)
                            chunk = reader.read(size, dtype="float32", always_2d=True)
                            if not np.isfinite(chunk).all():
                                raise ValueError("L'entrée contient NaN ou Inf.")
                            valid = len(chunk)
                            padded = np.pad(chunk, ((0, size - valid), (0, 0)))
                            prediction = ensemble.predict(padded, reader.samplerate)
                            accumulated += prediction * window[:, None]
                            normalization += window
                            # Aucun prochain segment ne commence avant start+hop :
                            # ces échantillons peuvent être écrits définitivement.
                            count = min(hop, valid)
                            vocal = (accumulated[:count] / normalization[:count, None]).astype(np.float32)
                            voice.write(vocal)
                            backing.write(chunk[:count] - vocal)
                            accumulated[:-hop] = accumulated[hop:]
                            accumulated[-hop:] = 0
                            normalization[:-hop] = normalization[hop:]
                            normalization[-hop:] = 0
                            logger.info("Progression : %.1f %%", 100 * (start + count) / reader.frames)
        except BaseException:
            # Ne laisser aucun résultat partiel après une erreur ou Ctrl+C.
            for path in created:
                path.unlink(missing_ok=True)
            raise
    return vocals_path, instrumental_path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--output-dir", type=Path, default=Path("separated"))
    parser.add_argument("--window-size", type=float, default=8.0, help="Secondes par segment")
    parser.add_argument("--overlap", type=float, default=0.5)
    parser.add_argument("--weights", nargs=2, type=float, default=(0.6, 0.4),
                        metavar=("SPECTRAL", "TEMPORAL"))
    parser.add_argument("--cpu-threads", type=int, default=2)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    logger = logging.getLogger("uvr_demo")
    config = PipelineConfig(args.window_size, args.overlap, *args.weights)
    try:
        config.validate()
        if args.cpu_threads < 1:
            raise ValueError("cpu-threads doit être >= 1.")
        torch.set_num_threads(args.cpu_threads)
        device = detect_device()
        logger.warning("Modèles SIMULÉS sans poids entraînés : qualité vocale non garantie.")
        logger.info("Matériel : %s", device)
        if device.type == "mps":
            logger.info("STFT complexe sur CPU ; chemin temporel sur MPS.")
        ensemble = WeightedEnsemble(
            [SpectrogramDemo(device), WaveformDemo(device)], list(args.weights),
        )
        paths = separate_file(args.input, args.output_dir, ensemble, config, logger)
        logger.info("Terminé : %s ; %s", *paths)
    except (ValueError, OSError, RuntimeError) as exc:
        logger.exception("Échec de séparation : %s", exc)
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
