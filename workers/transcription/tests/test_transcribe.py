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

    def test_rejects_audio_over_duration_quota(self):
        with self.assertRaises(transcribe.WorkerError) as raised:
            transcribe.validate_duration(901, 900)
        self.assertEqual(raised.exception.code, "AUDIO_TOO_LONG")

    def test_accepts_audio_at_duration_quota(self):
        transcribe.validate_duration(900, 900)

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

    def test_decode_request_rejects_malformed_json(self):
        with self.assertRaises(transcribe.WorkerError) as raised:
            transcribe.decode_request("{not-json")
        self.assertEqual(raised.exception.code, "INVALID_REQUEST")

    def test_decode_request_rejects_non_object_payloads(self):
        with self.assertRaises(transcribe.WorkerError) as raised:
            transcribe.decode_request("[1, 2, 3]")
        self.assertEqual(raised.exception.code, "INVALID_REQUEST")

    @patch.object(transcribe, "process_request", return_value=0)
    def test_process_line_decodes_one_request(self, process_request):
        self.assertEqual(transcribe.process_line('{"trackId":"track"}'), 0)
        process_request.assert_called_once_with({"trackId": "track"})


if __name__ == "__main__":
    unittest.main()
