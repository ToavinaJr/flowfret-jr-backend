# Transcription worker

Requires Python 3.11+, FFmpeg (`ffmpeg` and `ffprobe` on PATH), and the packages in `requirements.txt`.

The NestJS BullMQ processor starts this worker with one JSON request on stdin. Progress is emitted as JSON Lines on stdout; diagnostic logs use stderr. Audio is downloaded only after HTTPS, hostname, DNS, redirect, content type, timeout, and size validation. Temporary files are always removed.
