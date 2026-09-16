import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

MODULE_PATH = Path(__file__).parents[1] / "transcribe.py"
SPEC = importlib.util.spec_from_file_location("transcribe", MODULE_PATH)
transcribe = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(transcribe)


class TranscribeUtilitiesTest(unittest.TestCase):
    def test_lrc_timestamp_supports_long_tracks(self):
        self.assertEqual(transcribe.lrc_timestamp(3661.239), "61:01.24")

    def test_generate_lrc(self):
        result = transcribe.generate_lrc("Title", "Artist", "en", [{"start": 4.2, "text": " Hello  world "}])
        self.assertIn("[00:04.20]Hello world", result)

    def test_rejects_http_url(self):
        with self.assertRaises(transcribe.WorkerError):
            transcribe.validate_public_https_url("http://example.com/a.mp3", ["example.com"])

    @patch("socket.getaddrinfo", return_value=[(None, None, None, None, ("127.0.0.1", 443))])
    def test_rejects_hostname_resolving_to_private_ip(self, _resolve):
        with self.assertRaises(transcribe.WorkerError) as raised:
            transcribe.validate_public_https_url("https://audio.example.com/a.mp3", ["example.com"])
        self.assertEqual(raised.exception.code, "AUDIO_HOST_NOT_ALLOWED")

    def test_azure_requires_configuration(self):
        with patch.dict(transcribe.os.environ, {}, clear=True):
            with self.assertRaises(transcribe.WorkerError) as raised:
                transcribe.azure_transcribe(Path(__file__), {"language": "auto"})
        self.assertEqual(raised.exception.code, "AZURE_CONFIG_MISSING")


if __name__ == "__main__":
    unittest.main()
