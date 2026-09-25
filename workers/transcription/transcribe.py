#!/usr/bin/env python3
"""Streaming JSON-lines bridge for faster-whisper. Logs go to stderr only."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Iterator
sys.path.insert(0, str(Path(__file__).resolve().parent))
from transcribe_helpers import (
    NoRedirect,
    WorkerError,
    emit,
    fail,
    generate_lrc,
    lrc_timestamp,
    validate_public_https_url,
)



def download_audio(url: str, destination: Path, options: dict[str, Any]) -> None:
    max_bytes = int(options.get("maxAudioSizeMb", 100)) * 1024 * 1024
    timeout = max(1.0, float(options.get("downloadTimeoutMs", 120000)) / 1000)
    max_redirects = int(options.get("maxRedirects", 3))
    allowed_hosts = [str(value) for value in options.get("allowedHosts", [])]
    opener = urllib.request.build_opener(NoRedirect)
    current = url
    for redirect_count in range(max_redirects + 1):
        validate_public_https_url(current, allowed_hosts)
        request = urllib.request.Request(current, headers={"User-Agent": "FlowFret-Transcription/1.0", "Accept": "audio/*"})
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
                raise WorkerError("AUDIO_URL_EXPIRED", "Audius audio URL expired") from error
            raise WorkerError("AUDIO_DOWNLOAD_FAILED", "Audio download failed") from error
        except (urllib.error.URLError, TimeoutError, ConnectionError) as error:
            raise WorkerError("AUDIO_DOWNLOAD_FAILED", "Audius audio node is unreachable") from error
        content_type = response.headers.get_content_type()
        if not (content_type.startswith("audio/") or content_type in ("application/octet-stream", "video/mp4")):
            response.close()
            raise WorkerError("UNSUPPORTED_AUDIO_FORMAT", "Unsupported audio content type")
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
    result = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(path)], capture_output=True, text=True, timeout=30, check=True)
    return max(0.0, float(result.stdout.strip()))


def validate_duration(duration: float, max_duration: float) -> None:
    if duration > max_duration:
        raise WorkerError(
            "AUDIO_TOO_LONG",
            "Audio exceeds configured duration limit",
        )


def convert_audio(source: Path, destination: Path) -> None:
    try:
        subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", str(source), "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(destination)], capture_output=True, timeout=300, check=True)
    except (subprocess.SubprocessError, FileNotFoundError) as error:
        raise WorkerError("UNSUPPORTED_AUDIO_FORMAT", "FFmpeg could not prepare the audio") from error




def azure_multipart(fields: dict[str, str], file_path: Path) -> tuple[bytes, str]:
    boundary = f"----FlowFret{os.urandom(16).hex()}"
    chunks: list[bytes] = []
    for name, value in fields.items():
        chunks.extend([
            f"--{boundary}\r\n".encode(),
            f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode(),
            value.encode(),
            b"\r\n",
        ])
    chunks.extend([
        f"--{boundary}\r\n".encode(),
        b'Content-Disposition: form-data; name="file"; filename="audio.wav"\r\n',
        b"Content-Type: audio/wav\r\n\r\n",
        file_path.read_bytes(),
        b"\r\n",
        f"--{boundary}--\r\n".encode(),
    ])
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"


def azure_transcribe(path: Path, request: dict[str, Any]) -> tuple[list[dict[str, Any]], str]:
    endpoint = os.environ.get("AZURE_OPENAI_ENDPOINT", "").strip().rstrip("/")
    api_key = os.environ.get("AZURE_OPENAI_API_KEY", "").strip()
    deployment = os.environ.get("AZURE_OPENAI_DEPLOYMENT", "").strip()
    api_version = os.environ.get("AZURE_OPENAI_API_VERSION", "2024-06-01").strip()
    if not endpoint or not api_key or not deployment:
        raise WorkerError(
            "AZURE_CONFIG_MISSING",
            "AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY and AZURE_OPENAI_DEPLOYMENT are required",
        )
    url = (
        f"{endpoint}/openai/deployments/{urllib.parse.quote(deployment, safe='')}"
        f"/audio/transcriptions?api-version={urllib.parse.quote(api_version, safe='')}"
    )
    fields = {"response_format": "verbose_json", "timestamp_granularities[]": "segment"}
    language = request.get("language")
    if language and language != "auto":
        fields["language"] = str(language)
    body, content_type = azure_multipart(fields, path)
    http_request = urllib.request.Request(
        url,
        data=body,
        headers={"api-key": api_key, "Content-Type": content_type, "Accept": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(http_request, timeout=900) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:500]
        raise WorkerError("AZURE_TRANSCRIPTION_FAILED", f"Azure transcription failed ({error.code}): {detail}") from error
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
        raise WorkerError("AZURE_TRANSCRIPTION_FAILED", "Azure transcription request failed") from error
    segments: list[dict[str, Any]] = []
    for index, item in enumerate(payload.get("segments") or []):
        start = float(item.get("start", 0))
        end = float(item.get("end", start))
        words = [
            {"start": float(word["start"]), "end": float(word["end"]), "text": str(word.get("word", "")), "probability": 0.0}
            for word in item.get("words") or []
            if word.get("start") is not None and word.get("end") is not None
        ]
        segments.append({"id": f"segment-{index + 1}", "start": start, "end": end, "text": str(item.get("text", "")).strip(), "words": words})
    if not segments and payload.get("text"):
        segments.append({"id": "segment-1", "start": 0.0, "end": 0.0, "text": str(payload["text"]).strip(), "words": []})
    detected = str(payload.get("language") or request.get("language") or "und")
    return segments, detected


MODEL_CACHE: dict[tuple[str, str, str], Any] = {}


def process_request(request: dict[str, Any]) -> int:
    temp_root: Path | None = None
    try:
        options = request.get("options", {})
        temp_root = Path(tempfile.mkdtemp(prefix="flowfret-transcription-", dir=options.get("tempDir") or None))
        downloaded = temp_root / "source.audio"
        prepared = temp_root / "prepared.wav"
        download_audio(str(request["audioUrl"]), downloaded, options)
        duration = probe_duration(downloaded)
        max_duration = float(options.get("maxDurationSeconds", 900))
        validate_duration(duration, max_duration)
        emit({"type": "started", "duration": duration})
        convert_audio(downloaded, prepared)
        provider = os.environ.get("LLM_PROVIDER", "whisper").strip().lower()
        if provider == "azure":
            collected, detected = azure_transcribe(prepared, request)
            info = None
            whisper_segments = []
        elif provider == "whisper":
            try:
                from faster_whisper import WhisperModel
            except ImportError as error:
                raise WorkerError("WHISPER_FAILED", "faster-whisper is not installed") from error
            model_key = (str(request.get("model", "small")), str(options.get("device", "cpu")), str(options.get("computeType", "int8")))
            model = MODEL_CACHE.get(model_key)
            if model is None:
                emit({"type": "model-loading"})
                model = WhisperModel(model_key[0], device=model_key[1], compute_type=model_key[2])
                MODEL_CACHE[model_key] = model
                emit({"type": "model-ready"})
            requested_language = request.get("language")
            whisper_language = None if requested_language in (None, "auto") else requested_language
            whisper_segments, info = model.transcribe(str(prepared), language=whisper_language, vad_filter=True, word_timestamps=True, beam_size=5)
            collected = []
        else:
            raise WorkerError("UNSUPPORTED_TRANSCRIPTION_PROVIDER", f"Unsupported transcription provider: {provider}")
        ready_sent = False
        initial_buffer = float(options.get("initialBufferSeconds", 45))
        if provider == "whisper":
            detected = str(getattr(info, "language", None) or request.get("language") or "und")
            for index, item in enumerate(whisper_segments):
                segment = {"id": f"segment-{index + 1}", "start": float(item.start), "end": float(item.end), "text": str(item.text).strip(), "words": [{"start": float(word.start), "end": float(word.end), "text": str(word.word), "probability": float(word.probability)} for word in (item.words or []) if word.start is not None and word.end is not None]}
                collected.append(segment)
                emit({"type": "segment", "segment": segment})
                progress = min(99, round((segment["end"] / duration) * 100)) if duration else 0
                emit({"type": "progress", "progress": progress, "bufferedUntil": segment["end"]})
                if not ready_sent and (segment["end"] >= initial_buffer or segment["end"] >= duration - 0.25):
                    ready_sent = True
                    emit({"type": "ready-to-play", "bufferedUntil": segment["end"]})
        else:
            for segment in collected:
                emit({"type": "segment", "segment": segment})
                progress = min(99, round((segment["end"] / duration) * 100)) if duration and segment["end"] else 0
                emit({"type": "progress", "progress": progress, "bufferedUntil": segment["end"]})
            if collected:
                emit({"type": "ready-to-play", "bufferedUntil": collected[-1]["end"]})
        emit({"type": "completed", "duration": duration, "detectedLanguage": detected, "lrc": generate_lrc(request.get("title"), request.get("artist"), detected, collected)})
        return 0
    except WorkerError as error:
        fail(error.code, str(error))
        print(f"worker error: {error.code}", file=sys.stderr)
        return 1
    except Exception as error:
        fail("WHISPER_FAILED", "Transcription worker failed")
        print(f"worker error: {type(error).__name__}: {error}", file=sys.stderr)
        return 1
    finally:
        if temp_root:
            shutil.rmtree(temp_root, ignore_errors=True)


def main() -> int:
    if "--server" in sys.argv:
        for line in sys.stdin:
            if line.strip():
                process_request(json.loads(line))
        return 0
    return process_request(json.loads(sys.stdin.read()))


if __name__ == "__main__":
    raise SystemExit(main())
