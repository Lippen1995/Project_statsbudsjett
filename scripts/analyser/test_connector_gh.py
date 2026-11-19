import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import unittest

SCRIPT = Path(__file__).with_name('connector-gh.py')

class ConnectorProtocol(unittest.TestCase):
    def test_live_response_protocol_and_cleanup(self):
        with tempfile.TemporaryDirectory() as directory:
            child = subprocess.Popen(
                ['python', str(SCRIPT), 'api', 'repos/Lippen1995/Project_statsbudsjett/pulls/86'],
                env={**os.environ, 'FELLESTALL_CONNECTOR_QUEUE': directory},
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            try:
                requests = []
                for _ in range(200):
                    requests = list(Path(directory).glob('*.request.json'))
                    if requests:
                        break
                    time.sleep(.01)
                self.assertEqual(len(requests), 1)
                request = requests[0]
                self.assertEqual(json.loads(request.read_text())['method'], 'GET')
                reply = request.with_name(request.name.replace('.request.', '.response.'))
                reply.write_text(json.dumps({'value': {'number': 86, 'body': 'æøå'}}))
                stdout, stderr = child.communicate(timeout=3)
                self.assertEqual(child.returncode, 0, stderr)
                self.assertEqual(json.loads(stdout), {'number': 86, 'body': 'æøå'})
                self.assertEqual(list(Path(directory).glob('*.json')), [])
            finally:
                if child.poll() is None:
                    child.kill()
                    child.communicate()

    def test_other_repository_is_rejected_before_queue_access(self):
        result = subprocess.run(
            ['python', str(SCRIPT), 'api', 'repos/other/repository/pulls/1'],
            capture_output=True, text=True)
        self.assertEqual(result.returncode, 1)
        self.assertIn('outside the authorized task', result.stderr)

if __name__ == '__main__':
    unittest.main()
