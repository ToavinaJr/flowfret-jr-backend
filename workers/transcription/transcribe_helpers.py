from __future__ import annotations

import ipaddress
import json
import socket
import urllib.parse
import urllib.request
from typing import Any

DEFAULT_AUDIUS_SUFFIXES = (
    "audius.co",
    "audius.work",
    "audiuscontent.co",
    "theblueprint.xyz",
    "zeogrid.com",
    "staked.cloud",
    "altego.net",
)


class WorkerError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def normalize_allowed_hosts(allowed_hosts: list[str]) -> list[str]:
    normalized: list[str] = []
    for host in allowed_hosts:
        candidate = str(host).strip().lower().strip("*.")
        if candidate and candidate not in normalized:
            normalized.append(candidate)
    return normalized or list(DEFAULT_AUDIUS_SUFFIXES)


def validate_public_https_url(url: str, allowed_hosts: list[str]) -> None:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise WorkerError("INVALID_AUDIO_URL", "Audio URL must be a valid HTTPS URL")
    hostname = parsed.hostname.lower().rstrip(".")
    allowed = normalize_allowed_hosts(allowed_hosts)
    if not any(hostname == candidate or hostname.endswith(f".{candidate}") for candidate in allowed):
        raise WorkerError("AUDIO_HOST_NOT_ALLOWED", "Audio host is not allowed")
    try:
        addresses = {item[4][0] for item in socket.getaddrinfo(hostname, 443, type=socket.SOCK_STREAM)}
    except socket.gaierror as error:
        raise WorkerError("AUDIO_DOWNLOAD_FAILED", "Audio host could not be resolved") from error
    if not addresses:
        raise WorkerError("AUDIO_DOWNLOAD_FAILED", "Audio host has no address")
    for address in addresses:
        if not ipaddress.ip_address(address).is_global:
            raise WorkerError("AUDIO_HOST_NOT_ALLOWED", "Audio host resolves to a non-public address")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req: urllib.request.Request, fp: Any, code: int, msg: str, headers: Any, newurl: str) -> None:
        return None


def emit(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), flush=True)


def fail(code: str, message: str) -> None:
    emit({"type": "failed", "errorCode": code, "message": message})


def lrc_timestamp(seconds: float) -> str:
    centiseconds = max(0, round(seconds * 100))
    minutes, remainder = divmod(centiseconds, 6000)
    whole_seconds, fraction = divmod(remainder, 100)
    return f"{minutes:02d}:{whole_seconds:02d}.{fraction:02d}"


def clean_lrc_text(text: str) -> str:
    return " ".join(text.replace("[", "(").replace("]", ")").split())


def generate_lrc(title: str | None, artist: str | None, language: str, segments: list[dict[str, Any]]) -> str:
    header = [f"[ti:{title or 'Unknown'}]", f"[ar:{artist or 'Unknown'}]", f"[la:{language}]", "[re:faster-whisper]", ""]
    lines = [f"[{lrc_timestamp(float(segment['start']))}]{clean_lrc_text(str(segment['text']))}" for segment in segments]
    return "\n".join(header + lines) + "\n"