"""Convert frame predictions to a contiguous, conservatively beat-aligned timeline."""
from bisect import bisect_left
import math

ROOTS = ("C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B")
QUALITIES = ("m", "", "dim", "aug", "m6", "6", "m7", "mMaj7", "maj7", "7", "dim7", "m7b5", "sus2", "sus4")


def chord_label(index: int) -> str:
    if index == 169:
        return "N"
    if index == 168:
        return "X"
    if not 0 <= index < 168:
        raise ValueError("Invalid chord class")
    return ROOTS[index // 14] + QUALITIES[index % 14]


def align_timeline(predictions: list[tuple[float, str]], duration: float, beats: list[float]) -> list[dict]:
    if not predictions or not math.isfinite(duration) or duration <= 0:
        raise ValueError("Invalid timeline")
    changes = [(0.0, predictions[0][1])]
    for time, label in predictions[1:]:
        if time >= duration:
            break
        if label == changes[-1][1]:
            continue
        index = bisect_left(beats, time)
        candidates = beats[max(0, index - 1):index + 1]
        nearest = min(candidates, key=lambda beat: abs(beat - time)) if candidates else time
        # Never force a syncopated change onto a distant beat or move a boundary backwards.
        snapped = nearest if abs(nearest - time) <= 0.12 else time
        boundary = snapped if changes[-1][0] < snapped < duration else time
        if boundary > changes[-1][0]:
            changes.append((boundary, label))
    return [
        {"start": start, "end": changes[index + 1][0] if index + 1 < len(changes) else duration, "chord": label}
        for index, (start, label) in enumerate(changes)
    ]
