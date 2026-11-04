#!/usr/bin/env python3
"""Single-shot separation via Demucs or the explicit UVR demo engine.

Spawned once per job. Inference diagnostics go to stderr; structured progress
and the final result are sent to the Node bridge on stdout.
"""
from __future__ import annotations

import json
import os
import re
from collections import deque
from threading import Thread
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
import urllib.parse
from pathlib import Path
from typing import Any
sys.path.insert(0, str(Path(__file__).resolve().parent))
from separate_helpers import NoRedirect, WorkerError, emit, fail, validate_public_https_url


def download_audio(url: str, destination: Path, options: dict[str, Any]) -> None:
    max_bytes = int(options.get("maxAudioSizeMb", 100)) * 1024 * 1024
    timeout = max(1.0, float(options.get("downloadTimeoutMs", 120000)) / 1000)
    max_redirects = int(options.get("maxRedirects", 3))
    allowed_hosts = [str(value) for value in options.get("allowedHosts", [])]
    opener = urllib.request.build_opener(NoRedirect)
    current = url
    for redirect_count in range(max_redirects + 1):
        validate_public_https_url(current, allowed_hosts)
        request = urllib.request.Request(current, headers={"User-Agent": "FlowFret-Stems/1.0", "Accept": "audio/*"})
        try:
            response = opener.open(request, timeout=timeout)
        except urllib.error.HTTPError as error:
            if error.code in (301, 302, 303, 307, 308):
                if redirect_count >= max_redirects:
                    raise WorkerError("AUDIO_DOWNLOAD_FAILED", "Too many audio redirects") from error
                location = error.headers.get("Location")
                if not location:
                    raise WorkerError("AUDIO_DOWNLOAD_FAILED", "Invalid audio redirect") from error
                current = urllib.parse.urljoin(current, location)
                continue
            if error.code in (401, 403):
                raise WorkerError("AUDIO_URL_EXPIRED", "Audio URL expired") from error
            raise WorkerError("AUDIO_DOWNLOAD_FAILED", "Audio download failed") from error
        except (urllib.error.URLError, TimeoutError, ConnectionError) as error:
            raise WorkerError("AUDIO_DOWNLOAD_FAILED", "Audio source is unreachable") from error
        declared = response.headers.get("Content-Length")
        if declared and int(declared) > max_bytes:
            response.close()
            raise WorkerError("AUDIO_TOO_LARGE", "Audio exceeds configured size limit")
        total = 0
        with response, destination.open("wb") as output:
            while True:
                chunk = response.read(64 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > max_bytes:
                    raise WorkerError("AUDIO_TOO_LARGE", "Audio exceeds configured size limit")
                output.write(chunk)
        return
    raise WorkerError("AUDIO_DOWNLOAD_FAILED", "Audio download failed")


def probe_duration(path: Path) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True, timeout=30, check=True,
    )
    return max(0.0, float(result.stdout.strip()))


def run_demucs(source: Path, output_dir: Path, model: str, mp3_bitrate: int, timeout_s: float, cpu_threads: int = 2, model_dir: str | None = None) -> tuple[Path, Path]:
    # BLAS sees host CPUs, not necessarily the Docker CPU quota. Match its
    # thread pools to the configured worker allocation to avoid oversubscription.
    environment = {**os.environ, "OMP_NUM_THREADS": str(cpu_threads),
                   "MKL_NUM_THREADS": str(cpu_threads), "OPENBLAS_NUM_THREADS": str(cpu_threads)}
    tail: deque[str] = deque(maxlen=20)
    last_progress = 0

    def consume_output(stream: Any) -> None:
        nonlocal last_progress
        for line in stream:
            tail.append(line)
            print(line.rstrip(), file=sys.stderr, flush=True)
            # htdemucs has a single inference progress bar. Other models may
            # contain several models; do not present their first bar as total progress.
            match = re.search(r"(\d{1,3})%\|", line)
            if model in ("uvr-demo", "uvr-mdx", "uvr-ensemble"):
                demo_progress = re.search(r"Progression : ([\d.]+) %", line)
                if demo_progress:
                    progress = min(90, 5 + int(float(demo_progress.group(1)) * 0.85))
                    if progress > last_progress:
                        last_progress = progress
                        emit({"type": "progress", "progress": progress})
            if model == "htdemucs" and match and "seconds" in line:
                progress = min(90, 5 + int(match.group(1)) * 85 // 100)
                if progress > last_progress:
                    last_progress = progress
                    emit({"type": "progress", "progress": progress})

    command = (
        [sys.executable, str(Path(__file__).with_name("uvr_worker.py")),
         str(source), str(output_dir / model / source.stem),
         "--cpu-threads", str(cpu_threads), "--bitrate", str(mp3_bitrate)]
        if model == "uvr-demo" else
        [
                sys.executable, "-m", "demucs",
                "--two-stems", "vocals",
                "--mp3", "--mp3-bitrate", str(mp3_bitrate),
                "-d", "cpu",
                "-n", model,
                "-o", str(output_dir),
                str(source),
        ]
    )
    if model in ("uvr-mdx", "uvr-ensemble"):
        command = [sys.executable, str(Path(__file__).with_name("uvr_trained_worker.py")),
                   str(source), str(output_dir / model / source.stem),
                   "--cpu-threads", str(cpu_threads), "--bitrate", str(mp3_bitrate),
                   "--model-dir", model_dir or str(Path.home() / ".cache/flowfret/uvr")]
        if model == "uvr-ensemble":
            command.append("--ensemble")
    try:
        print(
            f"UVR worker starting: model={model}, timeout_seconds={timeout_s:.0f}, "
            f"cpu_threads={cpu_threads}, source_bytes={source.stat().st_size}",
            file=sys.stderr,
            flush=True,
        )
        child = subprocess.Popen(
            command,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, encoding="utf-8", errors="replace", env=environment,
        )
        assert child.stdout is not None
        reader = Thread(target=consume_output, args=(child.stdout,), daemon=True)
        reader.start()
        try:
            code = child.wait(timeout=timeout_s)
        finally:
            if child.poll() is None:
                child.kill()
            child.wait()
            reader.join()
            child.stdout.close()
        if code != 0:
            detail = "".join(tail)[-2000:]
            # 137 / -9 = killed by the kernel (usually the container memory limit).
            raise WorkerError("DEMUCS_FAILED", f"Vocal separation failed (exit {code}): {detail}")
    except subprocess.TimeoutExpired as error:
        recent_output = re.sub(
            r"https?://\S+", "[redacted-url]", "".join(tail)[-1200:]
        ).strip()
        detail = f"Vocal separation using {model} exceeded {timeout_s:g} seconds"
        if recent_output:
            detail += f"; last worker output: {recent_output}"
        raise WorkerError("DEMUCS_TIMEOUT", detail) from error
    stem_dir = output_dir / model / source.stem
    vocals_path = stem_dir / "vocals.mp3"
    instrumental_path = stem_dir / "no_vocals.mp3"
    if not vocals_path.is_file() or not instrumental_path.is_file():
        raise WorkerError("DEMUCS_FAILED", "Demucs did not produce the expected output files")
    return vocals_path, instrumental_path


def process_request(request: dict[str, Any]) -> int:
    temp_root: Path | None = None
    try:
        options = request.get("options", {})
        temp_root = Path(tempfile.mkdtemp(prefix="flowfret-stems-", dir=options.get("tempDir") or None))
        downloaded = temp_root / "source.audio"
        audio_path = request.get("audioPath")
        if isinstance(audio_path, str) and audio_path:
            source_path = Path(audio_path)
            if not source_path.is_file():
                raise WorkerError("AUDIO_DOWNLOAD_FAILED", "Extracted audio is unavailable")
            shutil.copyfile(source_path, downloaded)
        else:
            download_audio(str(request["audioUrl"]), downloaded, options)
        duration = probe_duration(downloaded)
        max_duration = float(options.get("maxDurationSeconds", 420))
        if duration > max_duration:
            raise WorkerError("AUDIO_TOO_LONG", "Audio exceeds the configured duration limit for separation")
        emit({"type": "started", "duration": duration})
        model = str(options.get("model", "htdemucs"))
        mp3_bitrate = int(options.get("mp3Bitrate", 192))
        timeout_s = max(1.0, float(options.get("timeoutMs", 600000)) / 1000)
        output_dir = temp_root / "output"
        vocals_path, instrumental_path = run_demucs(downloaded, output_dir, model, mp3_bitrate, timeout_s, int(options.get("cpuThreads", 2)), options.get("modelDir"))
        emit({
            "type": "completed",
            "duration": duration,
            "vocalsPath": str(vocals_path),
            "instrumentalPath": str(instrumental_path),
            # The Node caller uploads both files to Cloudinary after this
            # process exits, then removes this whole directory itself.
            "tempDir": str(temp_root),
        })
        return 0
    except WorkerError as error:
        fail(error.code, str(error))
        print(f"worker error: {error.code}", file=sys.stderr)
        if temp_root and temp_root.exists():
            shutil.rmtree(temp_root, ignore_errors=True)
        return 1
    except Exception as error:
        fail("DEMUCS_FAILED", f"Vocal separation worker failed: {type(error).__name__}: {error}"[:1000])
        print(f"worker error: {type(error).__name__}: {error}", file=sys.stderr)
        if temp_root and temp_root.exists():
            shutil.rmtree(temp_root, ignore_errors=True)
        return 1


def main() -> int:
    return process_request(json.loads(sys.stdin.read()))


if __name__ == "__main__":
    raise SystemExit(main())
