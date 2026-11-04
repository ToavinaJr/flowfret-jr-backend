import contextlib
import io
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from separate import run_demucs
from separate_helpers import WorkerError


FAKE_DEMUCS = '''
import os, sys, time
from pathlib import Path
assert os.environ['OMP_NUM_THREADS'] == '2'
assert os.environ['MKL_NUM_THREADS'] == '2'
mode = os.environ.get('FAKE_DEMUCS_MODE')
if mode == 'timeout':
    print('inference pending at 73 percent', file=sys.stderr, flush=True)
    time.sleep(30)
if mode == 'failure':
    print('specific decoder failure', file=sys.stderr)
    sys.exit(1)
print(' 100%|##########| 81M/81M [2MiB/s]', file=sys.stderr, flush=True)
print(' 50%|#####     | 10/20 [1seconds/s]', file=sys.stderr, flush=True)
out = Path(sys.argv[sys.argv.index('-o') + 1]) / 'htdemucs' / 'source'
out.mkdir(parents=True)
if mode != 'missing':
    (out / 'vocals.mp3').write_bytes(b'vocals')
    (out / 'no_vocals.mp3').write_bytes(b'instrumental')
'''


class DemucsProcessTests(unittest.TestCase):
    def run_fake(self, mode, timeout=10):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'demucs.py').write_text(FAKE_DEMUCS)
            source = root / 'source.audio'
            source.write_bytes(b'audio')
            with patch.dict(os.environ, {'PYTHONPATH': directory, 'FAKE_DEMUCS_MODE': mode}):
                output = io.StringIO()
                with contextlib.redirect_stdout(output), contextlib.redirect_stderr(io.StringIO()):
                    vocals, backing = run_demucs(source, root / 'out', 'htdemucs', 192, timeout)
                self.assertEqual(vocals.read_bytes(), b'vocals')
                self.assertEqual(backing.read_bytes(), b'instrumental')
                return output.getvalue()

    def test_streams_progress_and_preserves_both_outputs(self):
        output = self.run_fake('success')
        self.assertIn('"progress":47', output)
        self.assertNotIn('"progress":90', output)

    def test_preserves_actual_failure_reason(self):
        with self.assertRaisesRegex(WorkerError, 'specific decoder failure'):
            self.run_fake('failure')

    def test_missing_stems_are_not_success(self):
        with self.assertRaisesRegex(WorkerError, 'expected output files'):
            self.run_fake('missing')

    def test_timeout_terminates_process(self):
        with self.assertRaises(WorkerError) as caught:
            self.run_fake('timeout', 1.5)
        self.assertEqual(caught.exception.code, 'DEMUCS_TIMEOUT')
        self.assertIn('using htdemucs exceeded 1.5 seconds', str(caught.exception))
        self.assertIn('inference pending at 73 percent', str(caught.exception))


if __name__ == '__main__':
    unittest.main()
