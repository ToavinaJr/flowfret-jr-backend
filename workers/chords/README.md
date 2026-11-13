# Neural chord recognition

FlowFret uses the published BTC transformer for 170 chord classes and Beat This!
small0 for beat/downbeat tracking. This implements the public two-stage approach
described by Chordify, not Chordify's proprietary model. Recognition remains an
estimate; no accuracy equivalence is claimed.

## Installation

Use a dedicated Python environment with PyTorch support (Python 3.11/3.12 recommended).
From the backend directory:

```sh
python -m pip install -r workers/chords/requirements.txt
python workers/chords/setup_models.py
```

The setup downloads BTC code and its checkpoint at immutable revision
`2682317be668032e6e4b269ded36adaa2ad57df0` and the published Beat This! small0
checkpoint. Models are not committed. Keep the downloaded BTC MIT LICENSE with
its files. The only compatibility edit replaces the removed numpy `np.float`
alias with `float` in the upstream transformer code.

Configure and restart the backend:

```dotenv
CHORD_ANALYSIS_ENABLED=true
CHORD_ANALYSIS_PYTHON_BIN=/absolute/path/to/venv/bin/python
CHORD_ANALYSIS_MODEL_DIR=workers/chords/models
CHORD_ANALYSIS_TIMEOUT_MS=900000
```

An enabled backend fails startup if required assets are absent. Install models
on each deployment; the web process needs Python, these dependencies, model files,
and a writable temporary directory. No model download happens during a request.
FFmpeg may be required by the decoding stack for codecs unsupported by libsndfile.

## Behaviour

- Authenticated uploads only, up to 20 MiB and 15 minutes of decoded audio.
- One inference process per API instance; CPU limited to two PyTorch threads.
- Temporary input is deleted on completion/failure; results cached in memory for
  the last 16 distinct inputs. No audio is sent to a third-party inference service.
- BTC operates on ten-second CQT patches; adjacent equal chord frames are merged.
- Only changes within 120 ms of a detected beat are snapped; other changes retain
  their original timing to preserve syncopation. Unknown and no-chord labels remain.
- The frontend labels the browser fallback explicitly if the server is disabled,
  busy or unavailable. This fallback is the existing chroma-template algorithm.
- Transposition changes displayed chord names and fingerings, not audio pitch.

## Sources

- [BTC paper and implementation](https://github.com/jayg996/BTC-ISMIR19) (MIT repository)
- [Beat This!](https://github.com/CPJKU/beat_this) (MIT code and published weights)
- [Chordify's public explanation](https://chordify.net/pages/technology-algorithm-explained/)

## Validation

```sh
python -m unittest discover -s workers/chords/tests
python workers/chords/analyze.py --audio example.wav --models workers/chords/models
```

Synthetic tests validate the integration and timeline invariants. Measure musical
accuracy separately against annotated recordings before making quality claims.
